import fs from "node:fs";
import path from "node:path";
import { expect, Page } from "@playwright/test";
import { SCREENSHOT_SCENARIOS, ScreenshotScenario } from "./scenarios";

export interface ScreenshotScenarioDefinition {
  name: ScreenshotScenario;
  description: string;
  capture: (page: Page, outputPath: string) => Promise<void>;
}

const clearPersistedProject = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    void indexedDB.deleteDatabase("synth-playground");
  });
};

const openApp = async (page: Page) => {
  await clearPersistedProject(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add Track" })).toBeVisible();
  await expect(page.locator(".track-canvas-shell")).toBeVisible();
};

const ensureScreenshotDir = (outputPath: string) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
};

const savePageScreenshot = async (page: Page, outputPath: string, locator?: string) => {
  ensureScreenshotDir(outputPath);
  if (locator) {
    await page.locator(locator).screenshot({ path: outputPath });
    return;
  }
  await page.screenshot({ path: outputPath, fullPage: true });
};

export const SCREENSHOT_SCENARIO_DEFINITIONS: Record<ScreenshotScenario, ScreenshotScenarioDefinition> = {
  "main-view": {
    name: "main-view",
    description: "Full main composition view",
    capture: async (page, outputPath) => {
      await openApp(page);
      await savePageScreenshot(page, outputPath);
    }
  },
  "help-modal": {
    name: "help-modal",
    description: "Quick help modal open over the main view",
    capture: async (page, outputPath) => {
      await openApp(page);
      await page.getByRole("button", { name: /Help/ }).click();
      await expect(page.getByRole("heading", { name: "Quick Help" })).toBeVisible();
      await savePageScreenshot(page, outputPath);
    }
  },
  "record-mode": {
    name: "record-mode",
    description: "Recording dock visible after arming record mode",
    capture: async (page, outputPath) => {
      await openApp(page);
      await page.getByRole("button", { name: "Record" }).click();
      await expect(page.locator(".recording-dock")).toBeVisible();
      await savePageScreenshot(page, outputPath);
    }
  },
  "patch-editor": {
    name: "patch-editor",
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
