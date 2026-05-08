import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { startDevServer, waitForServer } from "../ui-capture/common";
import { SCREENSHOT_SCENARIOS, ScreenshotScenario, resolveSpecificScreenshotScenarios } from "./scenarios";
import { assertScenarioRegistryAligned, getScenarioDefinition } from "./registry";

const screenshotLabel = process.env.SCREENSHOT_LABEL ?? "local";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3005);
const baseURL = `http://127.0.0.1:${port}`;
const screenshotRoot = path.join(process.cwd(), "artifacts", "screenshots", screenshotLabel);
const trackedFilesToRestore = ["next-env.d.ts", "tsconfig.json"] as const;

const parseRequestedScenarios = (): ScreenshotScenario[] => {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0 || args.includes("all")) {
    return [...SCREENSHOT_SCENARIOS];
  }
  const selection = resolveSpecificScreenshotScenarios(args);
  if (!selection.enabled) {
    throw new Error(selection.error || "No screenshot scenarios selected.");
  }
  return selection.value.split(",") as ScreenshotScenario[];
};

const run = async () => {
  assertScenarioRegistryAligned();
  const requestedScenarios = parseRequestedScenarios();
  const originalFileContents = new Map(
    trackedFilesToRestore.map(
      (filePath) => [filePath, fs.readFileSync(path.join(process.cwd(), filePath), "utf8")] as const
    )
  );
  const devServer = startDevServer(port);

  try {
    await waitForServer(baseURL, 120_000);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 1440, height: 1400 }
      });
      try {
        for (const scenario of requestedScenarios) {
          const page = await context.newPage();
          try {
            const definition = getScenarioDefinition(scenario);
            const outputPath = path.join(screenshotRoot, `${scenario}.png`);
            await definition.capture(page, outputPath);
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
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
