import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { ensureArtifactDir, savePageScreenshot, startDevServer, waitForServer } from "../ui-capture/common";
import { assertVideoRegistryAligned, getVideoScenarioDefinition, saveRecordedVideo } from "./registry";
import { resolveSpecificVideoScenarios, VIDEO_SCENARIOS, VideoScenario } from "./scenarios";

const videoLabel = process.env.VIDEO_LABEL ?? "local";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3006);
const baseURL = `http://127.0.0.1:${port}`;
const videoRoot = path.join(process.cwd(), "artifacts", "videos", videoLabel);
const trackedFilesToRestore = ["next-env.d.ts", "tsconfig.json"] as const;

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
  const originalFileContents = new Map(
    trackedFilesToRestore.map(
      (filePath) => [filePath, fs.readFileSync(path.join(process.cwd(), filePath), "utf8")] as const
    )
  );
  const devServer = startDevServer(port, {
    NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1"
  });

  try {
    await waitForServer(baseURL, 120_000);
    const browser = await chromium.launch({
      headless: true,
      // CI video capture runs in headless Chromium, where autoplay policy can
      // leave Web Audio suspended even after our scripted transport click.
      args: ["--autoplay-policy=no-user-gesture-required"]
    });
    try {
      for (const scenario of requestedScenarios) {
        const definition = getVideoScenarioDefinition(scenario);
        const videoOutputPath = path.join(videoRoot, `${scenario}.webm`);
        const posterOutputPath = path.join(videoRoot, `${scenario}.png`);
        ensureArtifactDir(videoOutputPath);
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
          await savePageScreenshot(page, posterOutputPath);
        } finally {
          await context.close();
        }
        try {
          await saveRecordedVideo(recordedVideo, videoOutputPath);
        } finally {
          fs.rmSync(tempVideoDir, { recursive: true, force: true });
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    devServer.kill("SIGTERM");
    for (const [filePath, contents] of originalFileContents.entries()) {
      fs.writeFileSync(path.join(process.cwd(), filePath), contents);
    }
  }
};

run().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? (error as Error).message}\n`);
  process.exit(1);
});
