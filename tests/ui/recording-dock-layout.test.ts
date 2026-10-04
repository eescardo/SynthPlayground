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
  test.each([620, 900, 1400])(
    "reserves dock space within a %ipx viewport",
    async (height) => {
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
            expect(canvasBox.height).toBeGreaterThan(0);
            expect(canvasBox.height).toBeLessThan(initialShell.height);
            expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(dockBox.y);
            expect((await toolbar.boundingBox())!.y).toBe(toolbarTop);
            expect(await page.evaluate(() => window.scrollY)).toBe(0);
          };
          await expectViewportLayout();
          await expect(dock.getByText("Recording", { exact: true })).toBeVisible({ timeout: 10_000 });
          await expectViewportLayout();
          const screenshotPath = `artifacts/screenshots/recording-dock-layout/recording-${height}.png`;
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
          const key = dock.locator(".piano-key.white").first();
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
        { env: { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" }, viewport: { width: 1400, height } }
      );
    },
    120_000
  );
});
