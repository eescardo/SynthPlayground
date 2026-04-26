import { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chromium, expect, type Page } from "@playwright/test";
import { afterEach, describe, test } from "vitest";
import { openPatchWorkspaceApp, startDevServer, waitForServer } from "../../scripts/ui-capture/common";

const PORT = 3601;
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface ElementMetrics {
  h: number;
  w: number;
  top: number;
  bottom: number;
  scrollH: number;
  clientH: number;
}

interface PatchWorkspaceMetrics {
  zoom: string | null;
  layout: ElementMetrics | null;
  main: ElementMetrics | null;
  stage: ElementMetrics | null;
  shell: ElementMetrics | null;
  scroll: ElementMetrics | null;
  canvas: ElementMetrics | null;
}

const cleanupProcesses = new Set<ChildProcess>();

afterEach(async () => {
  for (const process of cleanupProcesses) {
    if (process.exitCode !== null) {
      continue;
    }
    process.kill("SIGTERM");
    await once(process, "exit");
  }
  cleanupProcesses.clear();
});

describe.sequential("patch workspace layout regression", () => {
  test("keeps the patch canvas frame height fixed while zoom changes after adding a module", async () => {
    const devServer = startDevServer(PORT);
    cleanupProcesses.add(devServer);

    await waitForServer(BASE_URL, 120_000);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 1400, height: 900 }
      });

      try {
        const page = await context.newPage();
        try {
          await openPatchWorkspaceApp(page);

          await page.getByRole("button", { name: "Duplicate", exact: true }).click();
          await page.getByRole("button", { name: "Add Module" }).click();

          const beforeZoom = await measurePatchWorkspace(page);
          await zoomCanvasOut(page, 12);
          const afterZoom = await measurePatchWorkspace(page);

          expect(afterZoom.zoom).not.toBe(beforeZoom.zoom);
          expect(afterZoom.canvas?.h ?? 0).toBeLessThan(beforeZoom.canvas?.h ?? 0);

          expectHeightsStable(beforeZoom.layout, afterZoom.layout, "patch layout");
          expectHeightsStable(beforeZoom.main, afterZoom.main, "patch main column");
          expectHeightsStable(beforeZoom.stage, afterZoom.stage, "patch canvas stage");
          expectHeightsStable(beforeZoom.shell, afterZoom.shell, "patch canvas shell");
          expectHeightsStable(beforeZoom.scroll, afterZoom.scroll, "patch canvas scroll");
        } finally {
          await page.close();
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }, 120_000);

  test("allows multiple tabs to explicitly select the same instrument patch without jumping tabs", async () => {
    const devServer = startDevServer(PORT);
    cleanupProcesses.add(devServer);

    await waitForServer(BASE_URL, 120_000);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 1400, height: 900 }
      });

      try {
        const page = await context.newPage();
        try {
          await openPatchWorkspaceApp(page);

          await page.getByRole("button", { name: "New instrument tab" }).click();
          await expect(activeTabLabel(page)).toHaveText("Tab 1");

          await page.locator(".instrument-patch-picker-caret").click();
          const alternateOption = page.locator(".instrument-patch-picker-option").nth(1);
          const alternatePatchName = (await alternateOption.textContent())?.replace("Current", "").trim() ?? "";
          await alternateOption.click();
          await expect(activeTabLabel(page)).toHaveText("Tab 1");
          await expect(page.locator(".instrument-patch-picker-name")).toHaveText(alternatePatchName);

          await page.locator(".instrument-patch-picker-caret").click();
          await page.getByRole("dialog", { name: "Select instrument" }).getByRole("button", { name: "Bass", exact: true }).click();
          await expect(activeTabLabel(page)).toHaveText("Tab 1");
          await expect(page.locator(".instrument-patch-picker-name")).toHaveText("Bass");

          await expect(page.locator(".patch-workspace-tab")).toHaveCount(2);
        } finally {
          await page.close();
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }, 120_000);

  test("sets, updates, and removes a patch baseline from the toolbar control", async () => {
    const devServer = startDevServer(PORT);
    cleanupProcesses.add(devServer);

    await waitForServer(BASE_URL, 120_000);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 1400, height: 900 }
      });

      try {
        const page = await context.newPage();
        try {
          await openPatchWorkspaceApp(page);

          const baselineControl = page.locator(".patch-baseline-control");
          await expect(baselineControl.locator(".patch-baseline-name")).toHaveText("None");

          await baselineControl.getByRole("button", { name: "Set" }).click();
          const firstBaselineName = await selectBaselineOption(page, 0);
          await expect(baselineControl.locator(".patch-baseline-name")).toHaveText(firstBaselineName);

          await baselineControl.getByRole("button", { name: "Update" }).click();
          const secondBaselineName = await selectBaselineOption(page, 1);
          await expect(baselineControl.locator(".patch-baseline-name")).toHaveText(secondBaselineName);

          await baselineControl.getByRole("button", { name: "Remove" }).click();
          await expect(baselineControl.locator(".patch-baseline-name")).toHaveText("None");
          await expect(baselineControl.getByRole("button", { name: "Set" })).toBeVisible();
        } finally {
          await page.close();
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }, 120_000);
});

const activeTabLabel = (page: Page) => page.locator(".patch-workspace-tab.active .patch-workspace-tab-name");

async function selectBaselineOption(page: Page, index: number): Promise<string> {
  const popover = page.getByRole("dialog", { name: "Select baseline patch" });
  await expect(popover).toBeVisible();
  const option = popover.locator(".patch-baseline-option").nth(index);
  const optionName = (await option.locator(".patch-baseline-option-name").textContent())?.trim();
  if (!optionName) {
    throw new Error(`Could not read baseline option name at index ${index}.`);
  }
  await option.click();
  await expect(popover).toBeHidden();
  return optionName;
}

async function zoomCanvasOut(page: Page, steps: number) {
  const target = page.locator(".patch-canvas-scroll");
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Could not determine patch canvas scroll bounds.");
  }

  for (let index = 0; index < steps; index += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 120);
    await page.keyboard.up("Control");
    await page.waitForTimeout(40);
  }
}

async function measurePatchWorkspace(page: Page): Promise<PatchWorkspaceMetrics> {
  return page.evaluate(() => {
    const pick = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        h: rect.height,
        w: rect.width,
        top: rect.top,
        bottom: rect.bottom,
        scrollH: element.scrollHeight,
        clientH: element.clientHeight
      };
    };

    return {
      zoom: document.querySelector(".patch-zoom-readout")?.textContent ?? null,
      layout: pick(".patch-layout"),
      main: pick(".patch-editor-main-column"),
      stage: pick(".patch-canvas-stage"),
      shell: pick(".patch-canvas-shell"),
      scroll: pick(".patch-canvas-scroll"),
      canvas: pick(".patch-canvas-overlay-shell > canvas")
    };
  });
}

function expectHeightsStable(before: ElementMetrics | null, after: ElementMetrics | null, label: string) {
  expect(before, `${label} should exist before zoom`).not.toBeNull();
  expect(after, `${label} should exist after zoom`).not.toBeNull();

  const delta = Math.abs((after?.h ?? 0) - (before?.h ?? 0));
  expect(delta, `${label} height changed unexpectedly`).toBeLessThanOrEqual(1.5);
}
