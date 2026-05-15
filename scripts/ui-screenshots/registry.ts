import { expect, Page } from "@playwright/test";
import {
  createMicrotonalCaptureProject,
  openApp,
  openSeededApp,
  savePageScreenshot,
  setupBaselineDiffWorkspace,
  setupMacroAutomationLane,
  setupPatchModuleFacesWorkspace,
  setupPatchWorkspaceProbes,
  setupSamplePlayerWorkspace
} from "../ui-capture/common";
import { applySelectionReviewFraming, showSelectionActionsPopover } from "../ui-capture/selectionCapture";
import { SCREENSHOT_SCENARIO, SCREENSHOT_SCENARIOS, ScreenshotScenario } from "./scenarios";
import {
  PATCH_CANVAS_GRID,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
} from "../../src/components/patch/patchCanvasConstants";
import { createDefaultProject } from "../../src/lib/patch/presets";

export interface ScreenshotScenarioDefinition {
  name: ScreenshotScenario;
  description: string;
  capture: (page: Page, outputPath: string) => Promise<void>;
}

async function clickPatchCanvasRaw(page: Page, rawX: number, rawY: number) {
  const canvas = page.locator(".patch-canvas-overlay-shell > canvas");
  const box = await canvas.boundingBox();
  const metrics = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const rect = canvasElement.getBoundingClientRect();
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      width: canvasElement.width,
      height: canvasElement.height
    };
  });
  if (!box || metrics.width <= 0 || metrics.height <= 0) {
    throw new Error("Could not resolve patch canvas dimensions for raw click.");
  }
  await page.mouse.click(
    box.x + rawX * (metrics.cssWidth / metrics.width),
    box.y + rawY * (metrics.cssHeight / metrics.height)
  );
}

function createPresetUpdateScreenshotProject() {
  const project = createDefaultProject();
  const stalePreset = project.patches.find((patch) => patch.meta.source === "preset");
  if (stalePreset?.meta.source !== "preset") {
    throw new Error("Could not resolve a bundled preset for preset update screenshot.");
  }
  stalePreset.meta.presetVersion -= 1;
  return project;
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
  [SCREENSHOT_SCENARIO.MICROTONAL_PITCHES]: {
    name: SCREENSHOT_SCENARIO.MICROTONAL_PITCHES,
    description: "Composer view with microtonal note labels and a 25-cent default pitch nudge visible",
    capture: async (page, outputPath) => {
      await openSeededApp(page, createMicrotonalCaptureProject());
      await page.keyboard.press("+");
      await expect(page.getByRole("button", { name: /Default pitch C4\+25/i })).toBeVisible();
      await savePageScreenshot(page, outputPath);
    }
  },
  [SCREENSHOT_SCENARIO.SELECTION_POPOVER]: {
    name: SCREENSHOT_SCENARIO.SELECTION_POPOVER,
    description: "Main view with a marquee selection and the selection actions popover visible",
    capture: async (page, outputPath) => {
      await openApp(page);
      await applySelectionReviewFraming(page);
      await showSelectionActionsPopover(page, page.locator(".track-canvas-shell > canvas"));
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
  [SCREENSHOT_SCENARIO.PRESET_UPDATE_MODAL]: {
    name: SCREENSHOT_SCENARIO.PRESET_UPDATE_MODAL,
    description: "Preset update modal open over the main view",
    capture: async (page, outputPath) => {
      await openSeededApp(page, createPresetUpdateScreenshotProject());
      await expect(page.getByRole("heading", { name: "Update Presets?" })).toBeVisible();
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
    description: "Patch workspace focused on the SamplePlayer inspector with a seeded pitch tracker probe",
    capture: async (page, outputPath) => {
      await setupSamplePlayerWorkspace(page);
      await savePageScreenshot(page, outputPath, ".patch-workspace-shell");
    }
  },
  [SCREENSHOT_SCENARIO.PATCH_MODULE_FACES]: {
    name: SCREENSHOT_SCENARIO.PATCH_MODULE_FACES,
    description:
      "Patch workspace with ADSR, LFO, string, noise, delay, reverb, overdrive, and compressor module faces visible",
    capture: async (page, outputPath) => {
      await setupPatchModuleFacesWorkspace(page);
      await savePageScreenshot(page, outputPath, ".patch-workspace-shell");
    }
  },
  [SCREENSHOT_SCENARIO.PATCH_EXPANDED_FACE]: {
    name: SCREENSHOT_SCENARIO.PATCH_EXPANDED_FACE,
    description: "Patch workspace with a large expanded module face visible over the canvas",
    capture: async (page, outputPath) => {
      await setupPatchModuleFacesWorkspace(page);
      await clickPatchCanvasRaw(
        page,
        26 * PATCH_CANVAS_GRID + PATCH_NODE_WIDTH / 2,
        19 * PATCH_CANVAS_GRID + PATCH_NODE_HEIGHT / 2
      );
      await savePageScreenshot(page, outputPath, ".patch-workspace-shell");
    }
  },
  [SCREENSHOT_SCENARIO.PATCH_BASELINE_DIFF]: {
    name: SCREENSHOT_SCENARIO.PATCH_BASELINE_DIFF,
    description:
      "Patch workspace with a duplicated tab showing baseline diff cues in the tab strip, canvas, inspector, and macro panel",
    capture: async (page, outputPath) => {
      await setupBaselineDiffWorkspace(page);
      await savePageScreenshot(page, outputPath, ".patch-workspace-shell");
    }
  },
  [SCREENSHOT_SCENARIO.MACRO_AUTOMATION_LANE]: {
    name: SCREENSHOT_SCENARIO.MACRO_AUTOMATION_LANE,
    description: "Track canvas with an automated macro lane and interpolated keyframes visible",
    capture: async (page, outputPath) => {
      await setupMacroAutomationLane(page);
      await savePageScreenshot(page, outputPath, ".track-canvas-shell");
    }
  }
};

export const assertScenarioRegistryAligned = () => {
  const definitionNames = Object.keys(SCREENSHOT_SCENARIO_DEFINITIONS).sort();
  const expectedNames = [...SCREENSHOT_SCENARIOS].sort();
  if (JSON.stringify(definitionNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Screenshot registry mismatch. Expected ${expectedNames.join(", ")} but found ${definitionNames.join(", ")}`
    );
  }
};

export const getScenarioDefinition = (scenario: ScreenshotScenario) => SCREENSHOT_SCENARIO_DEFINITIONS[scenario];
