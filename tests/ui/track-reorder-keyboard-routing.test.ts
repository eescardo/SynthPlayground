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
const captureOptions = { env: { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" } };

describe.sequential("composer interaction modes", () => {
  test.each([
    { outcome: "move", previousFocus: "handle" },
    { outcome: "no-op", previousFocus: "handle" },
    { outcome: "cancel", previousFocus: "handle" },
    { outcome: "move", previousFocus: "track-name" },
    { outcome: "no-op", previousFocus: "Play" },
    { outcome: "cancel", previousFocus: "Record" },
    { outcome: "move", previousFocus: "rename-input" }
  ] as const)(
    "mouse drag completion ($outcome, prior focus: $previousFocus) restores focus and editing mode",
    async ({ outcome, previousFocus }) => {
      const project = createManyTrackComposerProject(4);
      await withSeededComposerPage(
        project,
        async (page) => {
          const bar = page.locator("[data-composer-actions-bar]");
          const handle = page.getByTestId("track-reorder-handle").first();
          if (previousFocus === "rename-input") {
            await page.getByTestId("track-name-button").first().press("Enter");
          }
          const priorControl =
            previousFocus === "handle"
              ? handle
              : previousFocus === "track-name"
                ? page.getByTestId("track-name-button").filter({ hasText: project.tracks[0].name })
                : previousFocus === "rename-input"
                  ? page.locator(".track-name-input")
                  : page.getByRole("button", { name: previousFocus, exact: true });
          await priorControl.focus();
          const grip = (await handle.boundingBox())!;
          const destination = (await page
            .getByTestId("track-header-row")
            .nth(outcome === "move" ? 1 : 0)
            .boundingBox())!;
          await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
          await page.mouse.down();
          await page.mouse.move(destination.x + HEADER_WIDTH + 50, destination.y + destination.height * 0.8, {
            steps: 12
          });
          await expect(page.locator('[data-testid="track-reorder-handle"][data-dragging="true"]')).toHaveCount(1);
          await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
          if (outcome === "cancel") await page.keyboard.press("Escape");
          await page.mouse.up();
          await expect(page.locator('[data-testid="track-reorder-handle"][data-dragging="true"]')).toHaveCount(0);
          await expect(bar).toHaveAttribute("data-composer-mode", "editing");
          // The rename input unmounts on blur, so its saved node needs a fallback.
          if (previousFocus === "rename-input") await expect(priorControl).toHaveCount(0);
          await expect(
            previousFocus === "handle" || previousFocus === "rename-input"
              ? page.locator('[data-track-control="playhead-tabstop"]')
              : priorControl
          ).toBeFocused();
          await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
          await expect(page.getByRole("button", { name: "Record", exact: true })).toBeEnabled();
          const ids = project.tracks.map((track) => track.id);
          await expect
            .poll(() => readTrackIds(page))
            .toEqual(outcome === "move" ? [ids[1], ids[0], ...ids.slice(2)] : ids);
        },
        captureOptions
      );
    },
    120_000
  );

  test("Space remains consumed during count-in without cancelling or starting playback", async () => {
    const project = createManyTrackComposerProject(4);
    project.global.tempo = 60;
    await withSeededComposerPage(
      project,
      async (page) => {
        await page.getByRole("button", { name: "Record", exact: true }).click();
        await expect(page.locator(".record-countdown-badge")).toBeVisible();
        await page.locator('[data-track-control="playhead-tabstop"]').focus();
        const consumed = await page.evaluate(() => {
          const event = new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true });
          document.activeElement!.dispatchEvent(event);
          return event.defaultPrevented;
        });
        expect(consumed).toBe(true);
        await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "recording");
        await expect(page.locator(".record-countdown-badge")).toBeVisible();
        await expect(page.locator(".playhead")).toHaveText("Beat 1");
        await page.getByRole("button", { name: "Record", exact: true }).click();
      },
      captureOptions
    );
  }, 120_000);

  test("Space stops active recording without discarding recorded notes", async () => {
    await withSeededComposerPage(
      createManyTrackComposerProject(4),
      async (page) => {
        await page.getByRole("button", { name: "Record", exact: true }).click();
        await expect(page.locator(".recording-dock").getByText("Recording", { exact: true })).toBeVisible({
          timeout: 5000
        });
        await page.locator('[data-track-control="playhead-tabstop"]').focus();
        await page.keyboard.down("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(1);
        await page.keyboard.up("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(0);
        await page.keyboard.press("Space");
        await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "editing");
        await expect(page.locator(".recording-dock")).toHaveCount(0);
        await expect(page.getByTestId("track-reorder-handle").first()).toBeEnabled();
        await expect.poll(() => readTotalNoteCount(page)).toBe(1);
      },
      captureOptions
    );
  }, 120_000);

  test("seeking playback to the exact end stops further playhead updates", async () => {
    const project = createManyTrackComposerProject(4);
    project.global.compositionEnd = { beat: 8 };
    project.global.tempo = 60;
    await withSeededComposerPage(
      project,
      async (page) => {
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "playback");
        await page
          .locator(".track-canvas-shell")
          .click({ position: { x: HEADER_WIDTH + 8 * BEAT_WIDTH, y: RULER_HEIGHT / 2 } });
        await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "editing");
        await expect(page.locator(".playhead")).toHaveText("Beat 9");
        await page.waitForTimeout(300);
        await expect(page.locator(".playhead")).toHaveText("Beat 9");
        await expect(page.getByTestId("track-reorder-handle").first()).toBeEnabled();
      },
      captureOptions
    );
  }, 120_000);

  test("Redo removing a focused handle clears group discovery state", async () => {
    const project = createManyTrackComposerProject(4);
    await withSeededComposerPage(project, async (page) => {
      const handle = page.locator(`[data-testid="track-reorder-handle"][data-track-id="${project.tracks[0].id}"]`);
      const group = page.locator('[data-track-chrome="header-overlays"]');
      await page.getByRole("button", { name: "Remove Track", exact: true }).click();
      await expect(handle).toHaveCount(0);
      await page.keyboard.press("Control+z");
      await expect(handle).toHaveCount(1);
      await page.mouse.move(1200, 80);
      await handle.focus();
      await expect(group).toHaveAttribute("data-reorder-group-active", "true");
      await page.keyboard.press("Control+y");
      await expect(handle).toHaveCount(0);
      await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "editing");
      await expect(group).toHaveAttribute("data-reorder-group-active", "false");
      await expect(page.getByTestId("track-reorder-handle").first()).toHaveCSS("opacity", "0");
      await page.keyboard.press("Control+z");
      await expect(handle).toHaveCount(1);
      await expect(group).toHaveAttribute("data-reorder-group-active", "false");
    });
  }, 120_000);

  test("focus enters reorder mode, disables conflicting controls, and retains reorder Undo/Redo", async () => {
    const project = createManyTrackComposerProject(4);
    project.tracks[0].notes = [{ id: "routing-note", pitchStr: "C4", startBeat: 2, durationBeats: 1, velocity: 0.8 }];
    await withSeededComposerPage(
      project,
      async (page) => {
        await page
          .locator(".track-canvas-shell > canvas")
          .click({ position: { x: HEADER_WIDTH + 2.25 * BEAT_WIDTH, y: RULER_HEIGHT + TRACK_HEIGHT / 2 } });
        const pitch = page.getByRole("button", { name: "Selected note pitch C4", exact: true });
        const handle = page.locator(`[data-testid="track-reorder-handle"][data-track-id="${project.tracks[0].id}"]`);
        await handle.focus();
        const bar = page.locator("[data-composer-actions-bar]");
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await expect(pitch).toBeDisabled();
        await expect(page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Record", exact: true })).toBeDisabled();
        const playhead = await page.locator(".playhead").textContent();
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
          "Alt+x",
          "Control+v",
          "Shift+ArrowDown",
          "Alt+ArrowRight"
        ]) {
          await page.keyboard.press(key);
          await expect(handle).toBeFocused();
          await expect(page.locator(".playhead")).toHaveText(playhead!);
          await expect(page.locator(".help-modal-backdrop")).toHaveCount(0);
        }
        const clipboardEvents = await handle.evaluate((element) => {
          const seen: string[] = [];
          const observe = (event: Event) => seen.push(event.type);
          window.addEventListener("cut", observe);
          window.addEventListener("paste", observe);
          const cancelled = ["cut", "paste"].map((type) => {
            const event = new ClipboardEvent(type, {
              bubbles: true,
              cancelable: true,
              clipboardData: new DataTransfer()
            });
            element.dispatchEvent(event);
            return event.defaultPrevented;
          });
          window.removeEventListener("cut", observe);
          window.removeEventListener("paste", observe);
          return { seen, cancelled };
        });
        expect(clipboardEvents).toEqual({ seen: [], cancelled: [true, true] });
        expect((await readActiveProject(page)).tracks[0].notes).toEqual(project.tracks[0].notes);
        const order = project.tracks.map((track) => track.id);
        expect(await readTrackIds(page)).toEqual(order);
        await page.keyboard.press("ArrowDown");
        const reordered = [order[1], order[0], ...order.slice(2)];
        await expect.poll(() => readTrackIds(page)).toEqual(reordered);
        await expect(handle).toBeFocused();
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await page.keyboard.press("ArrowDown");
        const reorderedTwice = [order[1], order[2], order[0], ...order.slice(3)];
        await expect.poll(() => readTrackIds(page)).toEqual(reorderedTwice);
        await expect(handle).toBeFocused();
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await page.keyboard.press("Control+z");
        await expect.poll(() => readTrackIds(page)).toEqual(reordered);
        await expect(handle).toBeFocused();
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await page.keyboard.press("Control+z");
        await expect.poll(() => readTrackIds(page)).toEqual(order);
        await expect(handle).toBeFocused();
        await page.keyboard.press("Control+y");
        await expect.poll(() => readTrackIds(page)).toEqual(reordered);
        await page.keyboard.press("Control+y");
        await expect.poll(() => readTrackIds(page)).toEqual(reorderedTwice);
        await expect(handle).toBeFocused();
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await page.keyboard.press("Tab");
        await expect(handle).not.toBeFocused();
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
        await handle.focus();
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await page.keyboard.press("Escape");
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
        await expect
          .poll(() =>
            page.evaluate(() =>
              ["selected-content-tabstop", "playhead-tabstop"].includes(
                (document.activeElement as HTMLElement)?.dataset.trackControl ?? ""
              )
            )
          )
          .toBe(true);
        await expect(page.getByRole("button", { name: /^(Selected note|Placement) pitch / })).toBeEnabled();
        await expect(page.getByRole("button", { name: "Record", exact: true })).toBeEnabled();
      },
      captureOptions
    );
  }, 120_000);

  test("playback and recording including count-in disable mouse and keyboard reordering", async () => {
    const project = createManyTrackComposerProject(4);
    project.global.compositionEnd = { beat: 64 };
    await withSeededComposerPage(
      project,
      async (page) => {
        const bar = page.locator("[data-composer-actions-bar]");
        const handle = page.getByTestId("track-reorder-handle").first();
        const play = page.getByRole("button", { name: "Play", exact: true });
        const record = page.getByRole("button", { name: "Record", exact: true });
        const checkReorderDisabled = async () => {
          await expect(handle).toBeDisabled();
          await expect(handle).toHaveAttribute("draggable", "false");
          await handle.focus();
          await expect(handle).not.toBeFocused();
          const transfer = await page.evaluateHandle(() => new DataTransfer());
          await handle.dispatchEvent("dragstart", { dataTransfer: transfer });
          await expect(page.locator('[data-dragging="true"]')).toHaveCount(0);
          await transfer.dispose();
          expect(await readTrackIds(page)).toEqual(project.tracks.map((track) => track.id));
        };
        await play.click();
        await expect(bar).toHaveAttribute("data-composer-mode", "playback");
        await expect(record).toBeDisabled();
        await checkReorderDisabled();
        await page.getByRole("button", { name: "Stop", exact: true }).click();
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
        await expect(handle).toBeEnabled();
        await record.click();
        await expect(bar).toHaveAttribute("data-composer-mode", "recording");
        await expect(page.locator(".record-countdown-badge")).toBeVisible();
        await expect(play).toBeDisabled();
        await checkReorderDisabled();
        await expect(page.locator(".recording-dock").getByText("Recording", { exact: true })).toBeVisible({
          timeout: 5000
        });
        await checkReorderDisabled();
        await page.keyboard.down("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(1);
        await handle.focus();
        await page.keyboard.up("z");
        await expect(page.locator(".recording-dock .piano-key.selected")).toHaveCount(0);
        await record.click();
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
        await expect.poll(() => readTotalNoteCount(page)).toBe(1);
        await expect(handle).toBeEnabled();
      },
      captureOptions
    );
  }, 120_000);

  test("entering reorder mode releases an existing wheel-pitch scroll lock", async () => {
    const project = createManyTrackComposerProject(12);
    project.tracks[0].notes = [{ id: "wheel-note", pitchStr: "C4", startBeat: 2, durationBeats: 1, velocity: 0.8 }];
    await withSeededComposerPage(project, async (page) => {
      const shell = page.locator(".track-canvas-shell");
      const bar = page.locator("[data-composer-actions-bar]");
      const handle = page.getByTestId("track-reorder-handle").first();
      // Keep the 420ms wheel lock alive while React processes mode changes.
      await page.clock.install();
      await page.clock.pauseAt(Date.now() + 1000);
      const lockedScrollTop = await shell.evaluate(
        (element, point) => {
          const canvas = element.querySelector("canvas")!;
          const bounds = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              altKey: true,
              deltaY: -100,
              clientX: bounds.left + point.x,
              clientY: bounds.top + point.y
            })
          );
          element.scrollTop = 100;
          element.dispatchEvent(new Event("scroll"));
          return element.scrollTop;
        },
        { x: HEADER_WIDTH + 2 * BEAT_WIDTH + 8, y: RULER_HEIGHT + TRACK_HEIGHT / 2 }
      );
      expect(lockedScrollTop).toBe(0);

      await handle.focus();
      await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
      await expect(shell).toHaveCSS("overflow-x", "auto");
      const scrollTo = (top: number) =>
        shell.evaluate((element, nextTop) => {
          element.scrollTop = nextTop;
          element.dispatchEvent(new Event("scroll"));
          return element.scrollTop;
        }, top);
      expect(await scrollTo(100)).toBe(100);

      // Leaving reorder must not resurrect the previous gesture's lock.
      await handle.evaluate((element) => element.blur());
      await expect(bar).toHaveAttribute("data-composer-mode", "editing");
      expect(await scrollTo(150)).toBe(150);
      await page.clock.runFor(500);
      expect((await readActiveProject(page)).tracks[0].notes[0].pitchStr).toBe("C#4");
      await page.clock.resume();
    });
  }, 120_000);

  test("a pointer hold owns reorder mode until release or cancellation, independently of focus", async () => {
    await withSeededComposerPage(
      createManyTrackComposerProject(4),
      async (page) => {
        const handle = page.getByTestId("track-reorder-handle").first();
        const bar = page.locator("[data-composer-actions-bar]");
        await handle.dispatchEvent("pointerdown", { button: 0, pointerId: 1, pointerType: "touch" });
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await expect(page.getByRole("button", { name: "Record", exact: true })).toBeDisabled();
        await handle.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "touch" });
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
        await handle.focus();
        await handle.dispatchEvent("pointerdown", { button: 0 });
        await handle.dispatchEvent("pointerup", { button: 0 });
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await page.keyboard.press("Tab");
        await expect(page.getByTestId("track-name-button").first()).toBeFocused();
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
        await handle.focus();
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await expect(handle).not.toBeFocused();
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
      },
      captureOptions
    );
  }, 120_000);

  test("drag keeps the mode across blur and releases it on drop", async () => {
    const project = createManyTrackComposerProject(4);
    await withSeededComposerPage(
      project,
      async (page) => {
        const handle = page.getByTestId("track-reorder-handle").first();
        const bar = page.locator("[data-composer-actions-bar]");
        const transfer = await page.evaluateHandle(() => new DataTransfer());
        await handle.focus();
        await handle.dispatchEvent("dragstart", { dataTransfer: transfer });
        const nameControl = page.getByTestId("track-name-button").filter({ hasText: project.tracks[0].name });
        await nameControl.focus();
        await expect(bar).toHaveAttribute("data-composer-mode", "reordering");
        await expect(page.getByRole("button", { name: "Record", exact: true })).toBeDisabled();
        await page.locator("body").dispatchEvent("drop", { dataTransfer: transfer, clientX: 100, clientY: 2000 });
        await expect(bar).toHaveAttribute("data-composer-mode", "editing");
        await expect
          .poll(() => readTrackIds(page))
          .toEqual([...project.tracks.slice(1).map((track) => track.id), project.tracks[0].id]);
        await expect(nameControl).toBeFocused();
        await transfer.dispose();
      },
      captureOptions
    );
  }, 120_000);

  test.each(["reordering", "recording"] as const)(
    "entering %s finishes a held placement without growing it or seeking on release",
    async (mode) => {
      const project = createManyTrackComposerProject(4);
      // Keep recording in count-in throughout the release check; playback should not seek yet.
      project.global.tempo = 60;
      await withSeededComposerPage(
        project,
        async (page) => {
          await page.locator('[data-track-control="playhead-tabstop"]').focus();
          await page.keyboard.down("z");
          // Let placement start; autosave can stay debounced while its duration grows.
          await page.waitForTimeout(150);
          const playhead = await page.locator(".playhead").textContent();
          if (mode === "reordering") await page.getByTestId("track-reorder-handle").first().focus();
          else await page.getByRole("button", { name: "Record", exact: true }).click();
          await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", mode);
          await expect.poll(() => readTotalNoteCount(page)).toBe(1);
          const before = (await readActiveProject(page)).tracks[0].notes;
          // More than two grid steps would grow a still-owned placement at this tempo.
          await page.waitForTimeout(1200);
          await page.keyboard.up("z");
          expect((await readActiveProject(page)).tracks[0].notes).toEqual(before);
          await expect(page.locator(".playhead")).toHaveText(playhead!);
          if (mode === "reordering") await page.keyboard.press("Escape");
          else await page.getByRole("button", { name: "Record", exact: true }).click();
          await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "editing");
          await expect(page.getByRole("button", { name: "Record", exact: true })).toBeEnabled();
        },
        captureOptions
      );
    },
    120_000
  );
});
