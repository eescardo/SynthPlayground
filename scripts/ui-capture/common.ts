import fs from "node:fs";
import path from "node:path";
import { ChildProcess, spawn } from "node:child_process";
import { expect, Locator, Page } from "@playwright/test";

export const ensureArtifactDir = (outputPath: string) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
};

export const clearPersistedProject = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    void indexedDB.deleteDatabase("synth-playground");
  });
};

export const openApp = async (page: Page) => {
  await clearPersistedProject(page);
  await page.goto("/");
  await expect(page.locator(".track-canvas-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".track-name-button").first()).toBeVisible();
};

export const openPatchWorkspaceApp = async (page: Page) => {
  await clearPersistedProject(page);
  await page.goto("/patch-workspace");
  await expect(page.locator(".patch-workspace-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Back to Composer" })).toBeVisible();
};

const getTrackCanvas = (page: Page) => page.locator(".track-canvas-shell > canvas");

export const setupMacroAutomationLane = async (page: Page, options?: { settleMs?: number }) => {
  await openApp(page);
  const settleMs = options?.settleMs ?? 0;
  const trackButtons = page.locator(".track-name-button");
  const trackCount = await trackButtons.count();
  let automated = false;
  for (let index = 0; index < trackCount; index += 1) {
    await trackButtons.nth(index).click({ force: true });
    const expandButton = page.getByRole("button", { name: "Expand macro lanes" }).first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
    }
    const automateButton = page.locator('.track-inspector-action-button[title="Automate in timeline"]').first();
    if (await automateButton.isVisible().catch(() => false)) {
      await automateButton.click();
      automated = true;
      break;
    }
  }
  if (!automated) {
    throw new Error("Could not find a track with macro automation actions for capture setup.");
  }
  await expect(page.locator('.track-inspector-action-button[title="Collapse lane"]').first()).toBeVisible();

  const canvas = getTrackCanvas(page);
  await canvas.click({ position: { x: 430, y: 118 } });
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
  await canvas.click({ position: { x: 770, y: 148 } });
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
  return { canvas };
};

export const waitForServer = async (url: string, timeoutMs: number) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
};

export const startDevServer = (port: number, envOverrides?: Record<string, string>): ChildProcess =>
  spawn("pnpm", ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, ...envOverrides }
  });

export const savePageScreenshot = async (page: Page, outputPath: string, locator?: string) => {
  ensureArtifactDir(outputPath);
  if (locator) {
    await page.locator(locator).screenshot({ path: outputPath });
    return;
  }
  await page.screenshot({ path: outputPath, fullPage: true });
};

export const holdLocatorFor = async (page: Page, locator: Locator, durationMs: number) => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Could not determine locator bounds for press-and-hold interaction.");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
};
