import fs from "node:fs";
import path from "node:path";
import { expect, Locator, Page, Video } from "@playwright/test";
import { holdLocatorFor, openApp } from "../ui-capture/common";
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
const reviewZoom = Number(process.env.VIDEO_REVIEW_ZOOM ?? 0.82);
const marqueeHoldMs = Number(process.env.VIDEO_MARQUEE_HOLD_MS ?? 250);

const getTransportButton = (page: Page, name: "Play" | "Stop" | "Record") =>
  page.locator(".transport").getByRole("button", { name });

const getRecordingKey = (page: Page, pitch = "C4"): Locator =>
  page.locator(".recording-dock").getByRole("button", { name: new RegExp(`\\b${pitch}\\b`, "i") }).first();

const getTrackCanvas = (page: Page) => page.locator(".track-canvas-shell > canvas");

const playQuarterPattern = async (page: Page, key: Locator) => {
  for (let cycle = 0; cycle < recordCycles; cycle += 1) {
    await holdLocatorFor(page, key, recordHoldMs);
    if (cycle < recordCycles - 1) {
      await page.waitForTimeout(recordGapMs);
    }
  }
};

const applyReviewFraming = async (page: Page) => {
  await page.evaluate((zoom) => {
    document.documentElement.style.zoom = String(zoom);
    window.scrollTo(0, 0);
  }, reviewZoom);
};

const dragCanvasRegion = async (
  page: Page,
  canvas: Locator,
  start: { x: number; y: number },
  end: { x: number; y: number }
) => {
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Could not determine track canvas bounds.");
  }

  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.waitForTimeout(marqueeHoldMs);
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 18 });
  await page.waitForTimeout(marqueeHoldMs);
  await page.mouse.up();
};

export const VIDEO_SCENARIO_DEFINITIONS: Record<VideoScenario, VideoScenarioDefinition> = {
  [VIDEO_SCENARIO.PLAY_FROM_START_5S]: {
    name: VIDEO_SCENARIO.PLAY_FROM_START_5S,
    description: "Start playback from beat 0 and capture five seconds of motion.",
    capture: async (page) => {
      await openApp(page);
      await applyReviewFraming(page);
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
      await applyReviewFraming(page);
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
    description: "Marquee-select notes, cut them, then paste them later onto a different track.",
    capture: async (page) => {
      await openApp(page);
      await applyReviewFraming(page);

      const canvas = getTrackCanvas(page);
      await dragCanvasRegion(page, canvas, { x: 230, y: 56 }, { x: 540, y: 160 });
      await page.waitForTimeout(postActionSettleMs);

      await page.keyboard.press("ControlOrMeta+X");
      await page.waitForTimeout(postActionSettleMs);

      await canvas.click({ position: { x: 80, y: 270 } });
      await page.waitForTimeout(postActionSettleMs);

      await canvas.click({ position: { x: 760, y: 12 } });
      await page.waitForTimeout(postActionSettleMs);

      await page.keyboard.press("ControlOrMeta+V");
      await page.waitForTimeout(postActionSettleMs * 2);
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
