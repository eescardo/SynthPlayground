import fs from "node:fs";
import path from "node:path";
import { ChildProcess, spawn } from "node:child_process";
import { expect, Locator, Page } from "@playwright/test";
import { createDefaultProject } from "../../src/lib/patch/presets";
import { getModuleSchema } from "../../src/lib/patch/moduleRegistry";
import { Patch } from "../../src/types/patch";

export const ensureArtifactDir = (outputPath: string) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
};

const PATCH_CANVAS_GRID = 24;
const PATCH_NODE_WIDTH = 204;
const PATCH_PORT_START_Y = 46;
const PATCH_PORT_ROW_GAP = 16;

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

const getDefaultPatchWorkspacePatch = (): Patch => {
  const project = createDefaultProject();
  const initialPatchId = project.ui.patchWorkspace.tabs[0]?.patchId ?? project.tracks[0]?.instrumentPatchId;
  const patch = project.patches.find((entry) => entry.id === initialPatchId) ?? project.patches[0];
  if (!patch) {
    throw new Error("Could not resolve default patch-workspace patch for capture helpers.");
  }
  return patch;
};

const resolveRawPortPoint = (patch: Patch, nodeId: string, portId: string, portKind: "in" | "out") => {
  const layout = patch.layout.nodes.find((node) => node.nodeId === nodeId);
  const node = patch.nodes.find((entry) => entry.id === nodeId);
  const schema = node ? getModuleSchema(node.typeId) : undefined;
  const ports = portKind === "in" ? schema?.portsIn : schema?.portsOut;
  const portIndex = ports?.findIndex((port) => port.id === portId) ?? -1;
  if (!layout || !schema || portIndex < 0) {
    throw new Error(`Could not resolve ${portKind} port point for ${nodeId}.${portId}`);
  }
  return {
    x: layout.x * PATCH_CANVAS_GRID + (portKind === "in" ? 0 : PATCH_NODE_WIDTH),
    y: layout.y * PATCH_CANVAS_GRID + PATCH_PORT_START_Y + portIndex * PATCH_PORT_ROW_GAP
  };
};

const resolveCanvasDisplayScale = async (page: Page) => {
  const canvas = page.locator(".patch-canvas-overlay-shell > canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Patch canvas bounding box was not available.");
  }
  const dimensions = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height
  }));
  return {
    canvas,
    box,
    scaleX: box.width / Math.max(1, dimensions.width),
    scaleY: box.height / Math.max(1, dimensions.height)
  };
};

export const clickPatchPort = async (page: Page, nodeId: string, portId: string, portKind: "in" | "out") => {
  const patch = getDefaultPatchWorkspacePatch();
  const point = resolveRawPortPoint(patch, nodeId, portId, portKind);
  const { box, scaleX, scaleY } = await resolveCanvasDisplayScale(page);
  await page.mouse.click(box.x + point.x * scaleX, box.y + point.y * scaleY);
};

export const clickPatchConnectionMidpoint = async (
  page: Page,
  fromNodeId: string,
  fromPortId: string,
  toNodeId: string,
  toPortId: string
) => {
  const patch = getDefaultPatchWorkspacePatch();
  const from = resolveRawPortPoint(patch, fromNodeId, fromPortId, "out");
  const to = resolveRawPortPoint(patch, toNodeId, toPortId, "in");
  const { box, scaleX, scaleY } = await resolveCanvasDisplayScale(page);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  await page.mouse.click(box.x + midX * scaleX, box.y + midY * scaleY);
};

export const setupPatchWorkspaceProbes = async (page: Page) => {
  await openPatchWorkspaceApp(page);
  await expect(page.locator(".patch-workspace-shell .instrument-editor")).toBeVisible();

  await page.getByRole("button", { name: "Add Probe" }).click();
  await page.getByRole("button", { name: "Scope Probe" }).click();
  await expect(page.locator(".patch-probe-card")).toHaveCount(1);

  await page.getByRole("button", { name: "Attach" }).first().click();
  await clickPatchConnectionMidpoint(page, "vco1", "out", "mix1", "in1");

  await page.getByRole("button", { name: "Add Probe" }).click();
  await page.getByRole("button", { name: "Spectrum Probe" }).click();
  await expect(page.locator(".patch-probe-card")).toHaveCount(2);

  await page.locator(".patch-probe-card").nth(1).getByRole("button", { name: "Attach" }).click();
  await clickPatchPort(page, "vca1", "out", "out");

  const cards = page.locator(".patch-probe-card");
  await cards.nth(0).dragTo(page.locator(".patch-canvas-overlay-shell"), {
    targetPosition: { x: 360, y: 380 }
  });
  await cards.nth(1).dragTo(page.locator(".patch-canvas-overlay-shell"), {
    targetPosition: { x: 860, y: 380 }
  });

  await cards.nth(0).click({ position: { x: 24, y: 48 } });
  await cards.nth(1).click({ position: { x: 24, y: 48 } });

  await page.getByRole("button", { name: "Play" }).last().click();
  await page.waitForTimeout(650);
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
