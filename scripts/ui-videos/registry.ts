import fs from "node:fs";
import path from "node:path";
import { expect, Locator, Page, Video } from "@playwright/test";
import { holdLocatorFor, openApp } from "../ui-capture/common";
import { applySelectionReviewFraming, showSelectionActionsPopover } from "../ui-capture/selectionCapture";
import { VIDEO_SCENARIO, VIDEO_SCENARIOS, VideoScenario } from "./scenarios";

export interface VideoScenarioDefinition {
  name: VideoScenario;
  description: string;
  capture: (page: Page) => Promise<void>;
}

const playbackDurationMs = Number(process.env.VIDEO_PLAYBACK_DURATION_MS ?? 5_000);
const recordCountInMs = Number(process.env.VIDEO_RECORD_COUNT_IN_MS ?? 3_200);
const recordHoldMs = Number(process.env.VIDEO_RECORD_HOLD_MS ?? 500);
const recordGapMs = Number(process.env.VIDEO_RECORD_GAP_MS ?? 500);
const recordCycles = Number(process.env.VIDEO_RECORD_CYCLES ?? 5);
const postActionSettleMs = Number(process.env.VIDEO_POST_ACTION_SETTLE_MS ?? 300);
const getTransportButton = (page: Page, name: "Play" | "Stop" | "Record") =>
  page.locator(".transport").getByRole("button", { name });

const getRecordingKey = (page: Page, pitch = "C4"): Locator =>
  page.locator(".recording-dock").getByRole("button", { name: new RegExp(`\\b${pitch}\\b`, "i") }).first();

const getTrackCanvas = (page: Page) => page.locator(".track-canvas-shell > canvas");

const setupMacroAutomationLane = async (page: Page) => {
  await openApp(page);
  const macroPanel = page.locator(".macro-panel");
  await expect(macroPanel).toBeVisible();
  await macroPanel.getByRole("button", { name: "Automate" }).first().click();
  await expect(macroPanel.getByRole("button", { name: "Collapse lane" }).first()).toBeVisible();
  const canvas = getTrackCanvas(page);
  await canvas.click({ position: { x: 430, y: 118 } });
  await page.waitForTimeout(postActionSettleMs);
  await canvas.click({ position: { x: 770, y: 148 } });
  await page.waitForTimeout(postActionSettleMs);
  return { canvas };
};

const playQuarterPattern = async (page: Page, key: Locator) => {
  for (let cycle = 0; cycle < recordCycles; cycle += 1) {
    await holdLocatorFor(page, key, recordHoldMs);
    if (cycle < recordCycles - 1) {
      await page.waitForTimeout(recordGapMs);
    }
  }
};

export const VIDEO_SCENARIO_DEFINITIONS: Record<VideoScenario, VideoScenarioDefinition> = {
  [VIDEO_SCENARIO.PLAY_FROM_START_5S]: {
    name: VIDEO_SCENARIO.PLAY_FROM_START_5S,
    description: "Start playback from beat 0 and capture five seconds of motion.",
    capture: async (page) => {
      await openApp(page);
      await applySelectionReviewFraming(page);
      await getTransportButton(page, "Play").click();
      await page.waitForTimeout(playbackDurationMs);
      await getTransportButton(page, "Stop").click();
      await page.waitForTimeout(postActionSettleMs);
    }
  },
  [VIDEO_SCENARIO.RECORD_FROM_START_8S]: {
    name: VIDEO_SCENARIO.RECORD_FROM_START_8S,
    description: "Arm record mode at beat 0, wait through count-in, then record alternating quarter-note presses.",
    capture: async (page) => {
      await openApp(page);
      await applySelectionReviewFraming(page);
      await getTransportButton(page, "Record").click();
      await expect(page.locator(".recording-dock")).toBeVisible();
      await page.waitForTimeout(recordCountInMs);
      const key = getRecordingKey(page);
      await expect(key).toBeVisible();
      await playQuarterPattern(page, key);
      await getTransportButton(page, "Record").click();
      await page.waitForTimeout(postActionSettleMs);
    }
  },
  [VIDEO_SCENARIO.SELECTION_CUT_PASTE]: {
    name: VIDEO_SCENARIO.SELECTION_CUT_PASTE,
    description: "Marquee-select notes, copy them, then paste them later onto a different track.",
    capture: async (page) => {
      await openApp(page);
      await applySelectionReviewFraming(page);

      const canvas = getTrackCanvas(page);
      await showSelectionActionsPopover(page, canvas);
      const selectionPopover = page.locator(".selection-actions-popover");
      await expect(selectionPopover).toBeVisible();
      await page.waitForTimeout(postActionSettleMs * 2);

      await selectionPopover.getByRole("button", { name: "Copy", exact: true }).click();
      await page.waitForTimeout(postActionSettleMs);

      await page.locator(".track-name-button").nth(4).click({ force: true });
      await page.waitForTimeout(postActionSettleMs);

      await canvas.click({ position: { x: 760, y: 12 } });
      await page.waitForTimeout(postActionSettleMs);
      await canvas.click({ position: { x: 760, y: 12 } });
      await page.waitForTimeout(postActionSettleMs);

      await page.locator(".timeline-actions-popover").getByRole("button", { name: "Paste", exact: true }).click();
      await page.waitForTimeout(postActionSettleMs * 4);
    }
  },
  [VIDEO_SCENARIO.MACRO_AUTOMATION_EDIT]: {
    name: VIDEO_SCENARIO.MACRO_AUTOMATION_EDIT,
    description: "Promote a macro to automation, add keyframes, then play back the edited lane.",
    capture: async (page) => {
      const { canvas } = await setupMacroAutomationLane(page);
      await canvas.click({ position: { x: 600, y: 128 } });
      await page.waitForTimeout(postActionSettleMs);
      await getTransportButton(page, "Play").click();
      await page.waitForTimeout(playbackDurationMs);
      await getTransportButton(page, "Stop").click();
      await page.waitForTimeout(postActionSettleMs);
    }
  }
};

export const assertVideoRegistryAligned = () => {
  const definitionNames = Object.keys(VIDEO_SCENARIO_DEFINITIONS).sort();
  const expectedNames = [...VIDEO_SCENARIOS].sort();
  if (JSON.stringify(definitionNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Video registry mismatch. Expected ${expectedNames.join(", ")} but found ${definitionNames.join(", ")}`);
  }
};

export const getVideoScenarioDefinition = (scenario: VideoScenario) => VIDEO_SCENARIO_DEFINITIONS[scenario];

export const saveRecordedVideo = async (video: Video | null, outputPath: string) => {
  if (!video) {
    throw new Error("Playwright page video was not available.");
  }
  const sourcePath = await video.path();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(sourcePath, outputPath);
};
