import { expect } from "@playwright/test";
import { afterEach, describe, test } from "vitest";
import { HEADER_WIDTH, RULER_HEIGHT } from "../../src/components/tracks/trackCanvasConstants";
import {
  createComposerTestHarness,
  createManyTrackComposerProject,
  readTrackIds,
  readScrollTopAcrossFrames,
  waitForScrollStability
} from "./helpers/composerTestHarness";

const { cleanup, withSeededComposerPage } = createComposerTestHarness(3603);
afterEach(cleanup);

describe.sequential("track reorder scrolling", () => {
  test.each([false, true])(
    "allows manual scrolling past a focused reorder handle (oversized: %s)",
    async (oversized) => {
      await withSeededComposerPage(createManyTrackComposerProject(10), async (page) => {
        const shell = page.locator(".track-canvas-shell");
        if (oversized) {
          await page.getByTestId("track-name-button").first().click();
          await page.getByRole("button", { name: "Expand macro lanes" }).click();
          await shell.evaluate((element) => {
            element.style.height = "96px";
            element.style.minHeight = "96px";
            element.style.maxHeight = "96px";
          });
        }
        const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]');
        await handle.focus();
        await waitForScrollStability(shell);

        // Wheel over the portaled grip, then over the canvas, with focus still on the grip.
        await handle.hover({ position: { x: 5, y: 5 } });
        const beforeWheel = await shell.evaluate((element) => element.scrollTop);
        await page.mouse.wheel(0, 160);
        await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeWheel + 100);
        await expect(handle).toBeFocused();

        const shellBox = (await shell.boundingBox())!;
        await page.mouse.move(shellBox.x + HEADER_WIDTH + 100, shellBox.y + RULER_HEIGHT + 20);
        const maximumScrollTop = await shell.evaluate((element) => element.scrollHeight - element.clientHeight);
        await page.mouse.wheel(0, maximumScrollTop);
        await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(maximumScrollTop);
        const scrolledFrames = await readScrollTopAcrossFrames(shell, 5);
        expect(scrolledFrames.every((value) => value === maximumScrollTop)).toBe(true);
        await expect(handle).toBeFocused();

        // A scrollbar-style position change also remains under the user's control.
        await shell.evaluate((element) => {
          element.scrollTop = 0;
        });
        await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(0);
        expect((await readScrollTopAcrossFrames(shell, 5)).every((value) => value === 0)).toBe(true);

        // Keyboard reordering must still reveal its focused track after manual scrolling away.
        await shell.evaluate((element) => {
          element.scrollTop = element.scrollHeight - element.clientHeight;
        });
        await page.keyboard.press("ArrowDown");
        await expect
          .poll(() => readTrackIds(page))
          .toEqual([
            "scroll-track-2",
            "scroll-track-1",
            ...Array.from({ length: 8 }, (_, index) => `scroll-track-${index + 3}`)
          ]);
        await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeLessThan(maximumScrollTop);
        await waitForScrollStability(shell);
        await expect(handle).toBeFocused();
      });
    },
    120_000
  );

  test("allows scrolling away from a handle after a pointer reorder", async () => {
    const project = createManyTrackComposerProject(10);
    await withSeededComposerPage(project, async (page) => {
      const shell = page.locator(".track-canvas-shell");
      const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]');
      await handle.focus();
      await handle.dragTo(page.locator('[data-track-control="instrument-selection"]').nth(1));
      await expect
        .poll(() => readTrackIds(page))
        .toEqual([project.tracks[1].id, project.tracks[0].id, ...project.tracks.slice(2).map((track) => track.id)]);
      await expect(handle).toBeFocused();

      const shellBox = (await shell.boundingBox())!;
      await page.mouse.move(shellBox.x + HEADER_WIDTH + 100, shellBox.y + RULER_HEIGHT + 20);
      const maximumScrollTop = await shell.evaluate((element) => element.scrollHeight - element.clientHeight);
      await page.mouse.wheel(0, maximumScrollTop);
      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(maximumScrollTop);
      expect((await readScrollTopAcrossFrames(shell, 5)).every((value) => value === maximumScrollTop)).toBe(true);
      await expect(handle).toBeFocused();
    });
  }, 120_000);
});
