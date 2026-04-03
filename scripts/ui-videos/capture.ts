import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { ensureArtifactDir, startDevServer, waitForServer } from "../ui-capture/common";
import { assertVideoRegistryAligned, getVideoScenarioDefinition, saveRecordedVideo } from "./registry";
import { resolveSpecificVideoScenarios, VIDEO_SCENARIOS, VideoScenario } from "./scenarios";

const videoLabel = process.env.VIDEO_LABEL ?? "local";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3006);
const baseURL = `http://127.0.0.1:${port}`;
const videoRoot = path.join(process.cwd(), "artifacts", "videos", videoLabel);

const parseRequestedScenarios = (): VideoScenario[] => {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0 || args.includes("all")) {
    return [...VIDEO_SCENARIOS];
  }
  const selection = resolveSpecificVideoScenarios(args);
  if (!selection.enabled) {
    throw new Error(selection.error || "No video scenarios selected.");
  }
  return selection.value.split(",") as VideoScenario[];
};

const run = async () => {
  assertVideoRegistryAligned();
  const requestedScenarios = parseRequestedScenarios();
  const devServer = startDevServer(port);

  try {
    await waitForServer(baseURL, 120_000);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const scenario of requestedScenarios) {
        const definition = getVideoScenarioDefinition(scenario);
        const outputPath = path.join(videoRoot, `${scenario}.webm`);
        ensureArtifactDir(outputPath);
        const tempVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), "synth-playground-video-"));
        const context = await browser.newContext({
          baseURL,
          viewport: { width: 1440, height: 1400 },
          recordVideo: {
            dir: tempVideoDir,
            size: { width: 1440, height: 1400 }
          }
        });
        const page = await context.newPage();
        const recordedVideo = page.video();
        try {
          await definition.capture(page);
        } finally {
          await context.close();
        }
        try {
          await saveRecordedVideo(recordedVideo, outputPath);
        } finally {
          fs.rmSync(tempVideoDir, { recursive: true, force: true });
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    devServer.kill("SIGTERM");
  }
};

run().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? (error as Error).message}\n`);
  process.exit(1);
});
