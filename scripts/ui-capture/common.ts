import fs from "node:fs";
import path from "node:path";
import { ChildProcess, spawn } from "node:child_process";
import { expect, Locator, Page } from "@playwright/test";
import { createDefaultProject } from "../../src/lib/patch/presets";
import { createId } from "../../src/lib/ids";
import { HOST_NODE_IDS } from "../../src/lib/patch/constants";
import { getModuleSchema } from "../../src/lib/patch/moduleRegistry";
import { Project } from "../../src/types/music";
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

export const seedProject = async (page: Page, project: Project) => {
  await page.addInitScript(async (seededProject: Project) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = window.indexedDB.deleteDatabase("synth-playground");
      deleteRequest.onerror = () => reject(deleteRequest.error ?? new Error("Failed to clear synth-playground database."));
      deleteRequest.onblocked = () => resolve();
      deleteRequest.onsuccess = () => resolve();
    });
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.open("synth-playground", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("projects")) {
          db.createObjectStore("projects");
        }
      };
      request.onerror = () => reject(request.error ?? new Error("Failed to open synth-playground database."));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put(seededProject, "active");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error("Failed to seed synth-playground database."));
      };
    });
  }, project);
};

export const openSeededPatchWorkspaceApp = async (page: Page, project: Project) => {
  await seedProject(page, project);
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

  await cards.nth(0).click({ position: { x: 24, y: 48 }, force: true });
  await cards.nth(1).click({ position: { x: 24, y: 48 }, force: true });

  await page.getByRole("button", { name: "Play" }).last().click();
  await page.waitForTimeout(650);
};

const createSerializedCaptureSampleData = () =>
  JSON.stringify({
    version: 1,
    name: "capture-sample.wav",
    sampleRate: 48_000,
    samples: Array.from({ length: 12_000 }, (_, index) => {
      const t = index / 48_000;
      const envelope = index < 9_000 ? 1 : Math.max(0, 1 - (index - 9_000) / 3_000);
      const hz = t < 0.12 ? 261.63 : t < 0.24 ? 329.63 : 392;
      return Math.sin(2 * Math.PI * hz * t) * 0.6 * envelope;
    })
  });

export const createSamplePlayerCaptureProject = (): Project => {
  const project = createDefaultProject();
  const patchId = createId("patch");
  const sampleNodeId = "sample1";
  const outputNodeId = "out1";
  const patch: Patch = {
    schemaVersion: 1,
    id: patchId,
    name: "Sample Player Capture",
    meta: { source: "custom" },
    nodes: [
      {
        id: sampleNodeId,
        typeId: "SamplePlayer",
        params: {
          mode: "oneshot",
          start: 0.12,
          end: 0.82,
          gain: 1,
          pitchSemis: 0,
          sampleData: createSerializedCaptureSampleData()
        }
      },
      {
        id: outputNodeId,
        typeId: "Output",
        params: {
          gainDb: -6,
          limiter: true
        }
      }
    ],
    connections: [
      {
        id: "sample_gate",
        from: { nodeId: HOST_NODE_IDS.gate, portId: "out" },
        to: { nodeId: sampleNodeId, portId: "gate" }
      },
      {
        id: "sample_pitch",
        from: { nodeId: HOST_NODE_IDS.pitch, portId: "out" },
        to: { nodeId: sampleNodeId, portId: "pitch" }
      },
      {
        id: "sample_out",
        from: { nodeId: sampleNodeId, portId: "out" },
        to: { nodeId: outputNodeId, portId: "in" }
      }
    ],
    ui: { macros: [] },
    layout: {
      nodes: [
        { nodeId: sampleNodeId, x: 8, y: 6 },
        { nodeId: outputNodeId, x: 18, y: 6 }
      ]
    },
    io: {
      audioOutNodeId: outputNodeId,
      audioOutPortId: "out"
    }
  };

  project.patches = [patch, ...project.patches];
  project.tracks[0] = {
    ...project.tracks[0],
    instrumentPatchId: patchId
  };
  const tabId = createId("patchTab");
  project.ui.patchWorkspace = {
    activeTabId: tabId,
    tabs: [
      {
        id: tabId,
        name: patch.name,
        patchId,
        selectedNodeId: sampleNodeId,
        selectedProbeId: "pitch_probe",
        probes: [
          {
            id: "pitch_probe",
            kind: "pitch_tracker",
            name: "Pitch Tracker",
            x: 20,
            y: 11,
            width: 10,
            height: 6,
            expanded: true,
            target: { kind: "connection", connectionId: "sample_out" }
          }
        ]
      }
    ]
  };
  return project;
};

export const setupSamplePlayerWorkspace = async (page: Page) => {
  await openSeededPatchWorkspaceApp(page, createSamplePlayerCaptureProject());
  await expect(page.getByRole("heading", { name: "Patch Workspace" })).toBeVisible();
  await expect(page.locator(".sample-waveform-preview")).toBeVisible();
  await expect(page.locator(".patch-probe-card.expanded")).toHaveCount(1);
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
  {
    const distDir = `.next-ui-capture-${port}`;
    fs.rmSync(path.join(process.cwd(), distDir), { recursive: true, force: true });
    return spawn("pnpm", ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, NEXT_UI_CAPTURE: "1", NEXT_DIST_DIR: distDir, ...envOverrides }
    });
  };

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
