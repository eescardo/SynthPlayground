import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "@playwright/test";
import {
  SCREENSHOT_SCENARIOS,
  ScreenshotScenario,
  resolveAllScreenshotScenarios,
  resolveSpecificScreenshotScenarios
} from "../screenshotScenarios";
import { assertScenarioRegistryAligned, getScenarioDefinition } from "./registry";

const screenshotLabel = process.env.SCREENSHOT_LABEL ?? "local";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3005);
const baseURL = `http://127.0.0.1:${port}`;
const screenshotRoot = path.join(process.cwd(), "artifacts", "screenshots", screenshotLabel);

const parseRequestedScenarios = (): ScreenshotScenario[] => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("all")) {
    return [...SCREENSHOT_SCENARIOS];
  }
  const selection = resolveSpecificScreenshotScenarios(args);
  if (!selection.enabled) {
    throw new Error(selection.error || "No screenshot scenarios selected.");
  }
  return selection.value.split(",") as ScreenshotScenario[];
};

const waitForServer = async (url: string, timeoutMs: number) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
};

const run = async () => {
  assertScenarioRegistryAligned();
  const requestedScenarios = parseRequestedScenarios();
  const devServer = spawn("pnpm", ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env }
  });

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
  }
};

run().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? (error as Error).message}\n`);
  process.exit(1);
});
