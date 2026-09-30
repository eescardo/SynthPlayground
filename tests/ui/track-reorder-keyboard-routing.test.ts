import { expect } from "@playwright/test";
import { afterEach, describe, test } from "vitest";
import { BEAT_WIDTH, HEADER_WIDTH, RULER_HEIGHT, TRACK_HEIGHT } from "../../src/components/tracks/trackCanvasConstants";
import {
  createComposerTestHarness,
  createManyTrackComposerProject,
  readActiveProject,
  readTotalNoteCount,
  readTrackIds
} from "./helpers/composerTestHarness";

const { cleanup, withSeededComposerPage } = createComposerTestHarness(3603);
afterEach(cleanup);

describe.sequential("track reorder keyboard routing", () => {
  test("lets keys reach window owners without deleting, transposing, placing, seeking, or playing from a grip", async () => {
    const project = createManyTrackComposerProject(4);
    project.tracks[0].notes = [{ id: "routing-note", pitchStr: "C4", startBeat: 2, durationBeats: 1, velocity: 0.8 }];
    await withSeededComposerPage(
      project,
      async (page) => {
        const canvas = page.locator(".track-canvas-shell > canvas");
        await canvas.click({ position: { x: HEADER_WIDTH + 2.25 * BEAT_WIDTH, y: RULER_HEIGHT + TRACK_HEIGHT / 2 } });
        const pitch = page.getByRole("button", { name: "Selected note pitch C4", exact: true });
        await expect(pitch).toBeVisible();
        const handle = page.getByTestId("track-reorder-handle").first();
        await handle.focus();
        const playhead = await page.locator(".playhead").textContent();
        await page.evaluate(() => {
          const observed = window as typeof window & { routedGripKeys?: string[] };
          observed.routedGripKeys = [];
          window.addEventListener("keydown", (event) => observed.routedGripKeys?.push(event.key));
        });
        for (const key of [
          "Space",
          "Enter",
          "Backspace",
          "Delete",
          "ArrowLeft",
          "ArrowRight",
          "-",
          "=",
          "_",
          "+",
          "?",
          "z",
          "Shift+q",
          "Alt+x"
        ]) {
          await page.keyboard.press(key);
          await expect(handle).toBeFocused();
          await expect(pitch).toBeVisible();
          await expect(page.locator(".playhead")).toHaveText(playhead!);
          await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
          await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
          await expect(page.locator(".help-modal-backdrop")).toHaveCount(0);
        }
        expect(
          await page.evaluate(() => (window as typeof window & { routedGripKeys?: string[] }).routedGripKeys)
        ).toContain("z");
        expect((await readActiveProject(page)).tracks[0].notes).toEqual(project.tracks[0].notes);
        expect(await readTrackIds(page)).toEqual(project.tracks.map((track) => track.id));
      },
      { env: { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" } }
    );
  }, 120_000);

  test("keeps recording note input separate from edit chords on a focused reorder handle", async () => {
    const project = createManyTrackComposerProject(4);
    project.global.compositionEnd = { beat: 64 };
    await withSeededComposerPage(
      project,
      async (page) => {
        const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]');
        await handle.focus();
        await page.keyboard.press("ArrowDown");
        const reorderedIds = ["scroll-track-2", "scroll-track-1", "scroll-track-3", "scroll-track-4"];
        await expect.poll(() => readTrackIds(page)).toEqual(reorderedIds);

        await page.keyboard.press("z");
        expect(await readTotalNoteCount(page)).toBe(0);
        await page.getByRole("button", { name: "Record", exact: true }).click();
        await expect(page.locator(".recording-dock").getByText("Recording", { exact: true })).toBeVisible({
          timeout: 5_000
        });
        await handle.focus();

        await page.keyboard.press("Control+z");
        await expect.poll(() => readTrackIds(page)).toEqual(project.tracks.map((track) => track.id));
        await page.keyboard.press("Control+y");
        await expect.poll(() => readTrackIds(page)).toEqual(reorderedIds);
        await page.keyboard.press("Control+z");
        await page.keyboard.press("Control+Shift+z");
        await expect.poll(() => readTrackIds(page)).toEqual(reorderedIds);
        for (const chord of ["Control+Alt+c", "Control+Alt+v"]) {
          await page.keyboard.press(chord);
        }
        expect(await readTotalNoteCount(page)).toBe(0);
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(0);

        await page.keyboard.down("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(1);
        await expect(handle).toBeFocused();
        await page.keyboard.up("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(0);
        await page.getByRole("button", { name: "Record", exact: true }).click();
        await expect.poll(() => readTotalNoteCount(page)).toBe(1);
        expect(await readTrackIds(page)).toEqual(reorderedIds);
      },
      { env: { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" } }
    );
  }, 120_000);

  test("releases an active recording note after focus and modifier state change", async () => {
    const project = createManyTrackComposerProject(4);
    project.global.compositionEnd = { beat: 64 };
    await withSeededComposerPage(
      project,
      async (page) => {
        const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]');
        await page.getByRole("button", { name: "Record", exact: true }).click();
        await expect(page.locator(".recording-dock").getByText("Recording", { exact: true })).toBeVisible({
          timeout: 5_000
        });

        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.down("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(1);
        await handle.focus();
        await page.keyboard.down("Shift");
        await page.keyboard.up("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(0);
        await page.keyboard.up("Shift");
        await page.getByRole("button", { name: "Record", exact: true }).click();
        await expect.poll(() => readTotalNoteCount(page)).toBe(1);
      },
      { env: { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" } }
    );
  }, 120_000);

  test("leaves every modified arrow to window handlers without reordering or closing mixer popovers", async () => {
    const project = createManyTrackComposerProject(6);
    await withSeededComposerPage(project, async (page) => {
      const originalOrder = project.tracks.map((track) => track.id);
      const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-3"]');
      const popover = page.locator('[data-track-popover="volume"]');
      await page.locator('[data-track-chrome="volume-button"]').first().click();
      await expect(popover).toBeVisible();
      await handle.focus();
      await page.evaluate(() => {
        const observedWindow = window as typeof window & { modifiedReorderKeys?: string[] };
        observedWindow.modifiedReorderKeys = [];
        window.addEventListener("keydown", (event) => {
          if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
          observedWindow.modifiedReorderKeys?.push(
            `${event.altKey ? "A" : ""}${event.ctrlKey ? "C" : ""}${event.metaKey ? "M" : ""}${event.shiftKey ? "S" : ""}:${event.key}`
          );
        });
      });

      const modifiedArrows = [
        "Alt+ArrowUp",
        "Alt+ArrowRight",
        "Alt+ArrowDown",
        "Alt+ArrowLeft",
        "Control+ArrowUp",
        "Control+ArrowRight",
        "Control+ArrowDown",
        "Control+ArrowLeft",
        "Meta+ArrowUp",
        "Meta+ArrowRight",
        "Meta+ArrowDown",
        "Meta+ArrowLeft",
        "Shift+ArrowUp",
        "Shift+ArrowRight",
        "Shift+ArrowDown",
        "Shift+ArrowLeft"
      ];
      for (const key of modifiedArrows) {
        await handle.focus();
        await page.keyboard.press(key);
        expect(await readTrackIds(page)).toEqual(originalOrder);
        await expect(popover).toBeVisible();
      }
      expect(
        await page.evaluate(() => (window as typeof window & { modifiedReorderKeys?: string[] }).modifiedReorderKeys)
      ).toEqual([
        "A:ArrowUp",
        "A:ArrowRight",
        "A:ArrowDown",
        "A:ArrowLeft",
        "C:ArrowUp",
        "C:ArrowRight",
        "C:ArrowDown",
        "C:ArrowLeft",
        "M:ArrowUp",
        "M:ArrowRight",
        "M:ArrowDown",
        "M:ArrowLeft",
        "S:ArrowUp",
        "S:ArrowRight",
        "S:ArrowDown",
        "S:ArrowLeft"
      ]);

      await handle.focus();
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => readTrackIds(page)).not.toEqual(originalOrder);
      await expect(popover).toHaveCount(0);
      await page.keyboard.press("Control+z");
      await expect.poll(() => readTrackIds(page)).toEqual(originalOrder);
      await expect(handle).toBeFocused();
    });
  }, 120_000);
});
