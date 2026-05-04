import fs from "node:fs";
import path from "node:path";
import { ChildProcess, spawn } from "node:child_process";
import { expect, Locator, Page } from "@playwright/test";
import { createDefaultProject } from "../../src/lib/patch/presets";
import { createId } from "../../src/lib/ids";
import { HOST_PORT_IDS } from "../../src/lib/patch/constants";
import { createDefaultParamsForType, getModuleSchema } from "../../src/lib/patch/moduleRegistry";
import { createPatchOutputPort } from "../../src/lib/patch/ports";
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

export const openSeededApp = async (page: Page, project: Project) => {
  await seedProject(page, project);
  await page.goto("/");
  await expect(page.locator(".track-canvas-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".track-name-button").first()).toBeVisible();
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
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -6, limiter: true })],
    connections: [
      {
        id: "sample_gate",
        from: { nodeId: HOST_PORT_IDS.gate, portId: "out" },
        to: { nodeId: sampleNodeId, portId: "gate" }
      },
      {
        id: "sample_pitch",
        from: { nodeId: HOST_PORT_IDS.pitch, portId: "out" },
        to: { nodeId: sampleNodeId, portId: "pitch" }
      },
      {
        id: "sample_out",
        from: { nodeId: sampleNodeId, portId: "out" },
        to: { nodeId: "output", portId: "in" }
      }
    ],
    ui: { macros: [] },
    layout: {
      nodes: [
        { nodeId: sampleNodeId, x: 8, y: 6 }
      ]
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

export const createPatchModuleFacesCaptureProject = (): Project => {
  const project = createDefaultProject();
  const patchId = "patch_module_faces_capture";
  const nodes: Patch["nodes"] = [
    {
      id: "env_shape",
      typeId: "ADSR",
      params: { ...createDefaultParamsForType("ADSR"), attack: 60, decay: 320, sustain: 0.46, release: 620, curve: -0.65 }
    },
    {
      id: "lfo_shape",
      typeId: "LFO",
      params: { ...createDefaultParamsForType("LFO"), wave: "triangle", freqHz: 7.5, pulseWidth: 0.42, bipolar: true }
    },
    {
      id: "string_shape",
      typeId: "KarplusStrong",
      params: { ...createDefaultParamsForType("KarplusStrong"), decay: 0.97, damping: 0.38, brightness: 0.86, excitation: "noise" }
    },
    {
      id: "noise_shape",
      typeId: "Noise",
      params: { ...createDefaultParamsForType("Noise"), color: "pink", gain: 0.72 }
    },
    {
      id: "delay_shape",
      typeId: "Delay",
      params: { ...createDefaultParamsForType("Delay"), timeMs: 420, feedback: 0.62, mix: 0.38 }
    },
    {
      id: "reverb_shape",
      typeId: "Reverb",
      params: { ...createDefaultParamsForType("Reverb"), size: 0.72, decay: 3.8, damping: 0.52, mix: 0.42 }
    },
    {
      id: "drive_shape",
      typeId: "Overdrive",
      params: { ...createDefaultParamsForType("Overdrive"), driveDb: 24, tone: 0.72, mode: "fuzz" }
    },
    {
      id: "comp_shape",
      typeId: "Compressor",
      params: { ...createDefaultParamsForType("Compressor"), thresholdDb: -30, ratio: 6, attackMs: 12, releaseMs: 260, autoMakeup: true, mix: 0.86 }
    },
    {
      id: "vca_shape",
      typeId: "VCA",
      params: { ...createDefaultParamsForType("VCA"), gain: 0.84, bias: 0.05 }
    },
    {
      id: "mix_shape",
      typeId: "Mixer4",
      params: { ...createDefaultParamsForType("Mixer4"), gain1: 0.78, gain2: 0.58, gain3: 0, gain4: 0 }
    }
  ];
  const patch: Patch = {
    schemaVersion: 1,
    id: patchId,
    name: "Module Face Visuals",
    meta: { source: "custom" },
    nodes,
    ports: [createPatchOutputPort({ gainDb: -8, limiter: true })],
    connections: [
      { id: "host_gate_env", from: { nodeId: HOST_PORT_IDS.gate, portId: "out" }, to: { nodeId: "env_shape", portId: "gate" } },
      { id: "host_gate_string", from: { nodeId: HOST_PORT_IDS.gate, portId: "out" }, to: { nodeId: "string_shape", portId: "gate" } },
      { id: "lfo_to_string_pitch", from: { nodeId: "lfo_shape", portId: "out" }, to: { nodeId: "string_shape", portId: "pitch" } },
      { id: "noise_to_vca", from: { nodeId: "noise_shape", portId: "out" }, to: { nodeId: "vca_shape", portId: "in" } },
      { id: "env_to_vca", from: { nodeId: "env_shape", portId: "out" }, to: { nodeId: "vca_shape", portId: "gainCV" } },
      { id: "vca_to_delay", from: { nodeId: "vca_shape", portId: "out" }, to: { nodeId: "delay_shape", portId: "in" } },
      { id: "delay_to_reverb", from: { nodeId: "delay_shape", portId: "out" }, to: { nodeId: "reverb_shape", portId: "in" } },
      { id: "reverb_to_drive", from: { nodeId: "reverb_shape", portId: "out" }, to: { nodeId: "drive_shape", portId: "in" } },
      { id: "drive_to_comp", from: { nodeId: "drive_shape", portId: "out" }, to: { nodeId: "comp_shape", portId: "in" } },
      { id: "comp_to_mix", from: { nodeId: "comp_shape", portId: "out" }, to: { nodeId: "mix_shape", portId: "in1" } },
      { id: "string_to_mix", from: { nodeId: "string_shape", portId: "out" }, to: { nodeId: "mix_shape", portId: "in2" } },
      { id: "mix_to_output", from: { nodeId: "mix_shape", portId: "out" }, to: { nodeId: "output", portId: "in" } }
    ],
    ui: { macros: [] },
    layout: {
      nodes: [
        { nodeId: "env_shape", x: 4, y: 3 },
        { nodeId: "lfo_shape", x: 15, y: 3 },
        { nodeId: "string_shape", x: 26, y: 3 },
        { nodeId: "noise_shape", x: 4, y: 11 },
        { nodeId: "vca_shape", x: 15, y: 11 },
        { nodeId: "delay_shape", x: 26, y: 11 },
        { nodeId: "reverb_shape", x: 4, y: 19 },
        { nodeId: "drive_shape", x: 15, y: 19 },
        { nodeId: "comp_shape", x: 26, y: 19 },
        { nodeId: "mix_shape", x: 37, y: 11 }
      ]
    }
  };

  project.patches = [patch, ...project.patches];
  project.tracks[0] = {
    ...project.tracks[0],
    instrumentPatchId: patchId
  };
  project.ui.patchWorkspace = {
    activeTabId: "patch_tab_module_faces",
    tabs: [
      {
        id: "patch_tab_module_faces",
        name: patch.name,
        patchId,
        selectedNodeId: "comp_shape",
        probes: []
      }
    ]
  };
  return project;
};

export const setupPatchModuleFacesWorkspace = async (page: Page) => {
  await openSeededPatchWorkspaceApp(page, createPatchModuleFacesCaptureProject());
  await expect(page.getByRole("heading", { name: "Patch Workspace" })).toBeVisible();
  await expect(page.locator(".patch-workspace-tab-name", { hasText: "Module Face Visuals" })).toBeVisible();
  await expect(page.locator(".patch-inspector")).toContainText("Compressor comp_shape");
  await expect(page.locator(".param-current-value-unit", { hasText: "ms eff" })).toBeVisible();
};

export const createMicrotonalCaptureProject = (): Project => {
  const project = createDefaultProject();
  project.tracks[0] = {
    ...project.tracks[0],
    notes: [
      {
        id: "micro_a",
        pitchStr: "C4+25",
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8
      },
      {
        id: "micro_b",
        pitchStr: "D4+50",
        startBeat: 1.5,
        durationBeats: 0.5,
        velocity: 0.82
      },
      {
        id: "micro_c",
        pitchStr: "B3+75",
        startBeat: 2.5,
        durationBeats: 0.25,
        velocity: 0.78
      }
    ]
  };
  return project;
};

export const createBaselineDiffCaptureProject = (): Project => {
  const project = createDefaultProject();
  const baselinePatchId = "patch_baseline_capture";
  const diffPatchId = "patch_diff_capture";
  const baselineTabId = "patch_tab_baseline";
  const diffTabId = "patch_tab_diff";

  const baselinePatch: Patch = {
    schemaVersion: 1,
    id: baselinePatchId,
    name: "Baseline Lead",
    meta: { source: "custom" },
    nodes: [
      {
        id: "vco1",
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "triangle" }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 20, decay: 240, sustain: 0.36, release: 420 }
      },
      {
        id: "vca1",
        typeId: "VCA",
        params: { ...createDefaultParamsForType("VCA"), gain: 1, bias: 0 }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -8, limiter: true })],
    connections: [
      {
        id: "pitch_to_vco",
        from: { nodeId: HOST_PORT_IDS.pitch, portId: "out" },
        to: { nodeId: "vco1", portId: "pitch" }
      },
      {
        id: "gate_to_env",
        from: { nodeId: HOST_PORT_IDS.gate, portId: "out" },
        to: { nodeId: "env1", portId: "gate" }
      },
      {
        id: "vco_to_vca",
        from: { nodeId: "vco1", portId: "out" },
        to: { nodeId: "vca1", portId: "in" }
      },
      {
        id: "env_to_vca",
        from: { nodeId: "env1", portId: "out" },
        to: { nodeId: "vca1", portId: "gainCV" }
      },
      {
        id: "vca_to_out",
        from: { nodeId: "vca1", portId: "out" },
        to: { nodeId: "output", portId: "in" }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_shape",
          name: "Shape",
          keyframeCount: 2,
          bindings: [
            {
              id: "binding_shape_attack",
              nodeId: "env1",
              paramId: "attack",
              map: "linear",
              min: 10,
              max: 280
            }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: "vco1", x: 6, y: 6 },
        { nodeId: "env1", x: 6, y: 12 },
        { nodeId: "vca1", x: 14, y: 8 }
      ]
    }
  };

  const diffPatch = structuredClone(baselinePatch);
  diffPatch.id = diffPatchId;
  diffPatch.name = "Baseline Lead Copy";
  diffPatch.nodes = diffPatch.nodes.filter((node) => node.id !== "env1");
  diffPatch.connections = diffPatch.connections.filter((connection) => !["gate_to_env", "env_to_vca", "vca_to_out"].includes(connection.id));
  diffPatch.ui.macros = [
    {
      id: "macro_shape",
      name: "Contour",
      keyframeCount: 2,
      bindings: []
    },
    {
      id: "macro_drive",
      name: "Drive",
      keyframeCount: 3,
      bindings: [
        {
          id: "binding_drive_amount",
          nodeId: "sat1",
          paramId: "driveDb",
          map: "linear",
          points: [
            { x: 0, y: 3 },
            { x: 0.5, y: 18 },
            { x: 1, y: 36 }
          ]
        }
      ]
    }
  ];
  const vco = diffPatch.nodes.find((node) => node.id === "vco1");
  const vca = diffPatch.nodes.find((node) => node.id === "vca1");
  if (!vco || !vca) {
    throw new Error("Could not resolve baseline diff capture nodes.");
  }
  vco.params.wave = "square";
  vco.params.pulseWidth = 0.34;
  vca.params.bias = 0.68;
  diffPatch.nodes.splice(diffPatch.nodes.length - 1, 0, {
    id: "sat1",
    typeId: "Saturation",
    params: { ...createDefaultParamsForType("Saturation"), driveDb: 14, mix: 0.42, type: "softclip" }
  });
  diffPatch.layout.nodes = diffPatch.layout.nodes
    .filter((entry) => entry.nodeId !== "env1")
    .map((entry) => (entry.nodeId === "output" ? { ...entry, x: 30, y: 8 } : entry));
  diffPatch.layout.nodes.splice(diffPatch.layout.nodes.length - 1, 0, { nodeId: "sat1", x: 22, y: 8 });
  diffPatch.connections.push(
    {
      id: "vca_to_sat",
      from: { nodeId: "vca1", portId: "out" },
      to: { nodeId: "sat1", portId: "in" }
    },
    {
      id: "sat_to_out",
      from: { nodeId: "sat1", portId: "out" },
      to: { nodeId: "output", portId: "in" }
    }
  );

  project.patches = [baselinePatch, diffPatch, ...project.patches];
  project.tracks[0] = {
    ...project.tracks[0],
    instrumentPatchId: diffPatchId
  };
  project.ui.patchWorkspace = {
    activeTabId: diffTabId,
    tabs: [
      {
        id: baselineTabId,
        name: "Original",
        patchId: baselinePatchId,
        probes: []
      },
      {
        id: diffTabId,
        name: "Diff View",
        patchId: diffPatchId,
        probes: []
      }
    ]
  };
  // Keep this assignment dynamic so the capture helper still compiles against the base revision
  // when the PR screenshot workflow overlays the latest tooling onto the PR base checkout.
  ((project.ui.patchWorkspace.tabs[1] as unknown) as Record<string, unknown>).baselinePatch = structuredClone(baselinePatch);
  return project;
};

export const setupBaselineDiffWorkspace = async (page: Page) => {
  await openSeededPatchWorkspaceApp(page, createBaselineDiffCaptureProject());
  await expect(page.getByRole("heading", { name: "Patch Workspace" })).toBeVisible();
  await expect(page.locator(".patch-workspace-tab")).toHaveCount(2);
  await expect(page.locator(".patch-workspace-tab").first()).toContainText("Original");
  await expect(page.locator(".patch-workspace-tab").last()).toContainText("Diff View");
  await expect(page.locator(".patch-macro-row")).toHaveCount(2);
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
