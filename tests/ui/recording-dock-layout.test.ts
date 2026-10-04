import { afterEach, describe, test } from "vitest";
import { expect } from "@playwright/test";
import { ensureArtifactDir } from "../../scripts/ui-capture/common";
import {
  createComposerTestHarness,
  createManyTrackComposerProject,
  readTotalNoteCount
} from "./helpers/composerTestHarness";

const { cleanup, withSeededComposerPage } = createComposerTestHarness(3603);
afterEach(cleanup);

describe("recording dock viewport layout", () => {
  test.each([
    [1400, 620],
    [1400, 900],
    [1400, 1400],
    [390, 520],
    [320, 568],
    [844, 390],
    [390, 620]
  ])(
    "reserves dock and usable canvas space within a %ix%i viewport",
    async (width, height) => {
      const project = createManyTrackComposerProject(24);
      project.global.tempo = 60;
      await withSeededComposerPage(
        project,
        async (page) => {
          const shell = page.locator(".track-canvas-shell");
          const dock = page.locator(".recording-dock");
          const toolbar = page.locator("[data-composer-actions-bar]");
          const initialShell = (await shell.boundingBox())!;
          const toolbarTop = (await toolbar.boundingBox())!.y;
          await page.getByRole("button", { name: "Record", exact: true }).click();
          await expect(dock.getByText("Record Count-In", { exact: true })).toBeVisible();

          const expectViewportLayout = async () => {
            await expect(dock).toBeInViewport({ ratio: 1 });
            await expect(dock.locator(".recording-dock-status")).toBeInViewport({ ratio: 1 });
            await expect(dock.locator(".piano-key.white").first()).toBeInViewport({ ratio: 1 });
            const canvasBox = (await shell.boundingBox())!;
            const dockBox = (await dock.boundingBox())!;
            expect(canvasBox.height).toBeGreaterThanOrEqual(120);
            if (width > 760 && height > 480) expect(canvasBox.height).toBeLessThan(initialShell.height);
            expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(dockBox.y);
            if (width > 760 && height > 480) expect((await toolbar.boundingBox())!.y).toBe(toolbarTop);
            await expect(page.getByRole("button", { name: "Record", exact: true })).toBeInViewport({ ratio: 1 });
            const documentSize = await page.evaluate(() => ({
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight
            }));
            expect(documentSize.width).toBeLessThanOrEqual(width);
            expect(documentSize.height).toBeLessThanOrEqual(height);
            expect(await page.evaluate(() => window.scrollY)).toBe(0);
          };
          await expectViewportLayout();
          await expect(dock.getByText("Recording", { exact: true })).toBeVisible({ timeout: 10_000 });
          await expectViewportLayout();
          const screenshotPath = `artifacts/screenshots/recording-dock-layout/recording-${width}x${height}.png`;
          ensureArtifactDir(screenshotPath);
          await page.screenshot({ path: screenshotPath, fullPage: false });

          // Scrolling tracks must not scroll the dock or the top-level controls.
          const dockTop = (await dock.boundingBox())!.y;
          await shell.evaluate((element) => {
            element.scrollTop = 200;
          });
          await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(200);
          expect((await dock.boundingBox())!.y).toBe(dockTop);
          await expectViewportLayout();

          // Use viewport coordinates so Playwright cannot hide a regression by scrolling to the key.
          // Avoid Next's development indicator over the bottom-left corner on phones.
          const key = dock.locator(".piano-key.white").nth(2);
          const keyBox = (await key.boundingBox())!;
          await page.mouse.move(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height - 10);
          await page.mouse.down();
          await expect(key).toHaveClass(/selected/);
          await page.mouse.up();
          await expect(key).not.toHaveClass(/selected/);
          await page.getByRole("button", { name: "Record", exact: true }).click();
          await expect(dock).toHaveCount(0);
          await expect.poll(async () => (await shell.boundingBox())!.height).toBe(initialShell.height);
          await expect.poll(() => readTotalNoteCount(page)).toBe(1);
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
        },
        { env: { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" }, viewport: { width, height } }
      );
    },
    120_000
  );
});
