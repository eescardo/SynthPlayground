import { afterEach, describe, test } from "vitest";
import { expect } from "@playwright/test";
import {
  createComposerTestHarness,
  createManyTrackComposerProject,
  readTotalNoteCount
} from "./helpers/composerTestHarness";

const { cleanup, withSeededComposerPage } = createComposerTestHarness(3603);
afterEach(cleanup);

describe("recording route ownership", () => {
  test.each(["count_in", "recording"])(
    "blocks Workspace and ends %s on browser navigation",
    async (phase) => {
      const project = createManyTrackComposerProject(4);
      project.global.tempo = 60;
      await withSeededComposerPage(
        project,
        async (page) => {
          const workspace = page.getByRole("button", { name: "Open Patch Workspace", exact: true });
          // Establish an actual client-side route in history so Back bypasses the button guard.
          await workspace.click();
          await expect(page).toHaveURL(/\/patch-workspace$/);
          await page.goBack();
          await expect(workspace).toBeEnabled();
          await page.getByRole("button", { name: "Record", exact: true }).click();
          await expect(workspace).toBeDisabled();
          await workspace.evaluate((element) => (element as HTMLButtonElement).click());
          await expect(page).not.toHaveURL(/\/patch-workspace$/);
          if (phase === "recording") {
            await expect(page.locator(".recording-dock").getByText("Recording", { exact: true })).toBeVisible({
              timeout: 10_000
            });
            await page.locator('[data-track-control="playhead-tabstop"]').focus();
            await page.keyboard.press("z");
            await expect.poll(() => readTotalNoteCount(page)).toBe(1);
          }
          await page.goForward();
          await expect(page).toHaveURL(/\/patch-workspace$/);
          await expect(page.locator(".recording-dock")).toHaveCount(0);
          const noteCount = phase === "recording" ? 1 : 0;
          await page.locator("body").click({ position: { x: 2, y: 2 } });
          await page.keyboard.press("z");
          await page.waitForTimeout(3500); // Also crosses the cancelled count-in deadline.
          expect(await readTotalNoteCount(page)).toBe(noteCount);
          await page.goBack();
          await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "editing");
          await expect(workspace).toBeEnabled();
          await expect(page.locator(".recording-dock")).toHaveCount(0);
        },
        { env: { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" } }
      );
    },
    120_000
  );
});
