import fs from "node:fs";
import path from "node:path";
import { expect, Locator, Page, Video } from "@playwright/test";
import { holdLocatorFor, openApp, setupMacroAutomationLane } from "../ui-capture/common";
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
const playbackStartTimeoutMs = Number(process.env.VIDEO_PLAYBACK_START_TIMEOUT_MS ?? 2_000);
const getTransportButton = (page: Page, name: "Play" | "Stop" | "Record") =>
  page.locator(".transport").getByRole("button", { name });

const getRecordingKey = (page: Page, pitch = "C4"): Locator =>
  page.locator(".recording-dock").getByRole("button", { name: new RegExp(`\\b${pitch}\\b`, "i") }).first();

const getTrackCanvas = (page: Page) => page.locator(".track-canvas-shell > canvas");
const getPlayhead = (page: Page) => page.locator(".playhead");

const parsePlayheadBeat = (value: string | null): number => {
  const match = value?.match(/Beat\s+([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1]) : Number.NaN;
};

const collectPlaybackDiagnostics = async (page: Page) => {
  const [playheadLabel, runtimeErrors, playDisabled, stopDisabled, nextIssueCount, nextToastText, pageState] = await Promise.all([
    getPlayhead(page).textContent(),
    page.locator(".error").allTextContents(),
    getTransportButton(page, "Play").isDisabled(),
    getTransportButton(page, "Stop").isDisabled(),
    page
      .evaluate(() => {
        const root = document.querySelector("nextjs-portal")?.shadowRoot;
        const issues = root?.querySelector("[data-issues-open]");
        return issues?.textContent?.trim() ?? null;
      })
      .catch(() => null),
    page
      .evaluate(() => {
        const root = document.querySelector("nextjs-portal")?.shadowRoot;
        const toast = root?.querySelector("[data-nextjs-toast]");
        return toast?.textContent?.trim() ?? null;
      })
      .catch(() => null),
    page.evaluate(() => ({
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      userAgent: navigator.userAgent
    }))
  ]);

  return {
    playheadLabel,
    runtimeErrors,
    playDisabled,
    stopDisabled,
    nextIssueCount,
    nextToastText,
    pageState
  };
};

const waitForPlaybackToAdvance = async (page: Page) => {
  const initialLabel = await getPlayhead(page).textContent();
  const initialBeat = parsePlayheadBeat(initialLabel);
  try {
    await expect
      .poll(
        async () => {
          const currentLabel = await getPlayhead(page).textContent();
          const currentBeat = parsePlayheadBeat(currentLabel);
          if (!Number.isFinite(initialBeat) || !Number.isFinite(currentBeat)) {
            return false;
          }
          return currentBeat > initialBeat + 0.25;
        },
        {
          timeout: playbackStartTimeoutMs,
          message: `Playback did not advance within ${playbackStartTimeoutMs}ms after pressing Play.`
        }
      )
      .toBe(true);
  } catch (error) {
    const diagnostics = await collectPlaybackDiagnostics(page);
    throw new Error(
      [
        (error as Error).message,
        `Playback diagnostics: ${JSON.stringify(
          {
            initialLabel,
            ...diagnostics
          },
          null,
          2
        )}`
      ].join("\n\n")
    );
  }
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
      await waitForPlaybackToAdvance(page);
      await page.waitForTimeout(playbackDurationMs);
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

      await page.locator(".track-name-button").last().click({ force: true });
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
      const { canvas } = await setupMacroAutomationLane(page, { settleMs: postActionSettleMs });
      await canvas.click({ position: { x: 600, y: 128 } });
      await page.waitForTimeout(postActionSettleMs);
      await getTransportButton(page, "Play").click();
      await waitForPlaybackToAdvance(page);
      await page.waitForTimeout(playbackDurationMs);
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
