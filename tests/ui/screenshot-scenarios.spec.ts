import fs from "node:fs";
import path from "node:path";
import { expect, Page, test } from "@playwright/test";

const screenshotLabel = process.env.SCREENSHOT_LABEL ?? "local";
const screenshotRoot = path.join(process.cwd(), "artifacts", "screenshots", screenshotLabel);

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

const saveScreenshot = async (page: Page, scenarioName: string, locator?: string) => {
  fs.mkdirSync(screenshotRoot, { recursive: true });
  const outputPath = path.join(screenshotRoot, `${scenarioName}.png`);
  if (locator) {
    await page.locator(locator).screenshot({ path: outputPath });
    return outputPath;
  }
  await page.screenshot({ path: outputPath, fullPage: true });
  return outputPath;
};

test("main-view @main-view", async ({ page }) => {
  await openApp(page);
  await saveScreenshot(page, "main-view");
});

test("help-modal @help-modal", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /Help/ }).click();
  await expect(page.getByRole("heading", { name: "Quick Help" })).toBeVisible();
  await saveScreenshot(page, "help-modal");
});

test("record-mode @record-mode", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.locator(".recording-dock")).toBeVisible();
  await saveScreenshot(page, "record-mode");
});

test("patch-editor @patch-editor", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("heading", { name: "Instrument" })).toBeVisible();
  await saveScreenshot(page, "patch-editor", ".instrument-editor");
});
