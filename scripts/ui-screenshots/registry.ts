import { expect, Page } from "@playwright/test";
import { openApp, savePageScreenshot } from "../ui-capture/common";
import { SCREENSHOT_SCENARIO, SCREENSHOT_SCENARIOS, ScreenshotScenario } from "./scenarios";

export interface ScreenshotScenarioDefinition {
  name: ScreenshotScenario;
  description: string;
  capture: (page: Page, outputPath: string) => Promise<void>;
}

export const SCREENSHOT_SCENARIO_DEFINITIONS: Record<ScreenshotScenario, ScreenshotScenarioDefinition> = {
  [SCREENSHOT_SCENARIO.MAIN_VIEW]: {
    name: SCREENSHOT_SCENARIO.MAIN_VIEW,
    description: "Full main composition view",
    capture: async (page, outputPath) => {
      await openApp(page);
      await savePageScreenshot(page, outputPath);
    }
  },
  [SCREENSHOT_SCENARIO.SELECTION_POPOVER]: {
    name: SCREENSHOT_SCENARIO.SELECTION_POPOVER,
    description: "Main view with a marquee selection and the selection actions popover visible",
    capture: async (page, outputPath) => {
      await openApp(page);
      const canvas = page.locator(".track-canvas-shell > canvas");
      const box = await canvas.boundingBox();
      if (!box) {
        throw new Error("Could not determine track canvas bounds.");
      }

      await page.mouse.move(box.x + 188, box.y + 42);
      await page.mouse.down();
      await page.mouse.move(box.x + 840, box.y + 168, { steps: 24 });
      await page.mouse.up();
      await page.waitForTimeout(300);

      await expect(page.locator(".selection-actions-popover")).toBeVisible();
      await savePageScreenshot(page, outputPath);
    }
  },
  [SCREENSHOT_SCENARIO.TRACK_NOTE_HOVER]: {
    name: SCREENSHOT_SCENARIO.TRACK_NOTE_HOVER,
    description: "Hovered note remains highlighted even when overlapping the playhead hit area",
    capture: async (page, outputPath) => {
      await openApp(page);
      await page.locator(".track-canvas-shell > canvas").hover({
        position: { x: 172, y: 64 }
      });
      await savePageScreenshot(page, outputPath, ".track-canvas-shell");
    }
  },
  [SCREENSHOT_SCENARIO.HELP_MODAL]: {
    name: SCREENSHOT_SCENARIO.HELP_MODAL,
    description: "Quick help modal open over the main view",
    capture: async (page, outputPath) => {
      await openApp(page);
      await page.getByRole("button", { name: /Help/ }).click();
      await expect(page.getByRole("heading", { name: "Quick Help" })).toBeVisible();
      await savePageScreenshot(page, outputPath);
    }
  },
  [SCREENSHOT_SCENARIO.RECORD_MODE]: {
    name: SCREENSHOT_SCENARIO.RECORD_MODE,
    description: "Recording dock visible after arming record mode",
    capture: async (page, outputPath) => {
      await openApp(page);
      await page.getByRole("button", { name: "Record" }).click();
      await expect(page.locator(".recording-dock")).toBeVisible();
      await savePageScreenshot(page, outputPath);
    }
  },
  [SCREENSHOT_SCENARIO.PATCH_EDITOR]: {
    name: SCREENSHOT_SCENARIO.PATCH_EDITOR,
    description: "Instrument editor and patch area",
    capture: async (page, outputPath) => {
      await openApp(page);
      await expect(page.getByRole("heading", { name: "Instrument" })).toBeVisible();
      await savePageScreenshot(page, outputPath, ".instrument-editor");
    }
  }
};

export const assertScenarioRegistryAligned = () => {
  const definitionNames = Object.keys(SCREENSHOT_SCENARIO_DEFINITIONS).sort();
  const expectedNames = [...SCREENSHOT_SCENARIOS].sort();
  if (JSON.stringify(definitionNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Screenshot registry mismatch. Expected ${expectedNames.join(", ")} but found ${definitionNames.join(", ")}`);
  }
};

export const getScenarioDefinition = (scenario: ScreenshotScenario) => SCREENSHOT_SCENARIO_DEFINITIONS[scenario];
