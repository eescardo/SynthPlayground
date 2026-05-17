import fs from "node:fs";
import inspector from "node:inspector";
import path from "node:path";
import { performance } from "node:perf_hooks";

import type { AudioProject, SchedulerEvent } from "@/types/audio";
import type { Patch } from "@/types/patch";
import type { PreviewProbeRequest } from "@/types/probes";

type ProfileNode = {
  id: number;
  callFrame: {
    functionName?: string;
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  children?: number[];
  hitCount?: number;
};

type CpuProfile = {
  nodes: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
};

type RenderCase = {
  id: string;
  captureProbes: PreviewProbeRequest[];
};

type CaseMetrics = {
  id: string;
  durationSeconds: number;
  blockCount: number;
  realtimeBudgetMs: number;
  processBlockMs: {
    total: number;
    average: number;
    max: number;
    p95: number;
    p99: number;
    overBudgetCount: number;
    overBudgetBlocks: Array<{ blockIndex: number; ms: number; postedMessages: number }>;
  };
  postMessage: {
    count: number;
    cloneMs: number;
    averageCloneMs: number;
    maxCloneMs: number;
    liveCaptureCount: number;
    finalCaptureCount: number;
    maxSpectrumColumns: number;
    maxSpectrumBins: number;
    maxFinalSpectrumColumns: number;
    maxFinalSpectrumBins: number;
    maxFullResolutionSamples: number;
  };
};

const args = process.argv.slice(2);

const readFlag = (name: string, fallback?: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const parseNumberFlag = (name: string, fallback: number) => {
  const raw = readFlag(name);
  const parsed = raw === undefined ? fallback : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasFlag = (name: string) => args.includes(name);

const slugify = (value: string) =>
  value
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const outputDir = readFlag("--output-dir", "artifacts/audio-profiles")!;
const label = readFlag("--label", "preview-probes")!;
const durationSeconds = Math.max(0.25, parseNumberFlag("--duration-seconds", 4));
const warmupRuns = Math.max(0, Math.floor(parseNumberFlag("--warmup-runs", 1)));
const includeStructuredClone = !hasFlag("--no-structured-clone");
const blockSize = 128;
const sampleRate = 48_000;
const realtimeBudgetMs = (blockSize / sampleRate) * 1000;

const postInspector = <T>(session: inspector.Session, method: string, params?: Record<string, unknown>) =>
  new Promise<T>((resolve, reject) => {
    session.post(method, params ?? {}, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result as T);
    });
  });

const readWasmBytes = () => fs.readFileSync("public/wasm/pkg/dsp_core_bg.wasm");

const loadRendererFactory = async () => {
  const module = await import("../../src/audio/worklets/synth-worklet-wasm-renderer.js");
  return (
    (module as unknown as { createWasmRenderer?: unknown; default?: { createWasmRenderer?: unknown } })
      .createWasmRenderer ??
    (module as unknown as { default?: { createWasmRenderer?: unknown } }).default?.createWasmRenderer
  );
};

const loadBassPatch = async (): Promise<Patch> => {
  const module = await import("../../src/lib/patch/presets");
  const bassPatch =
    (module as unknown as { bassPatch?: () => Patch }).bassPatch ??
    (module as unknown as { default?: { bassPatch?: () => Patch } }).default?.bassPatch;
  if (typeof bassPatch !== "function") {
    throw new Error("Unable to load bass patch preset for preview probe profiling.");
  }
  return bassPatch();
};

const createTrack = () => ({
  id: "track_1",
  name: "Track 1",
  instrumentPatchId: "preset_bass",
  notes: [],
  macroValues: {},
  macroAutomations: {},
  macroPanelExpanded: false,
  volume: 1,
  mute: false,
  solo: false,
  fx: {
    delayEnabled: false,
    reverbEnabled: false,
    saturationEnabled: false,
    compressorEnabled: false,
    delayMix: 0.2,
    reverbMix: 0.2,
    drive: 0.2,
    compression: 0.4
  }
});

const createProject = (patch: Patch): AudioProject => ({
  global: {
    sampleRate,
    tempo: 120,
    meter: "4/4",
    gridBeats: 0.25,
    loop: []
  },
  tracks: [createTrack()],
  patches: [patch],
  masterFx: {
    compressorEnabled: false,
    limiterEnabled: true,
    makeupGain: 0
  }
});

const createNoteEvents = (durationSamples: number): SchedulerEvent[] => [
  {
    id: "profile_note_on",
    type: "NoteOn",
    sampleTime: 0,
    source: "preview",
    trackId: "track_1",
    noteId: "profile_note",
    pitchVoct: -2,
    velocity: 1
  },
  {
    id: "profile_note_off",
    type: "NoteOff",
    sampleTime: Math.max(0, durationSamples - blockSize),
    source: "preview",
    trackId: "track_1",
    noteId: "profile_note"
  }
];

const createScopeProbe = (): PreviewProbeRequest => ({
  probeId: "profile_scope",
  kind: "scope",
  target: { kind: "port", nodeId: "sat", portId: "out", portKind: "out" }
});

const createSpectrumProbe = (windowSize: number, index = 0): PreviewProbeRequest => ({
  probeId: `profile_spectrum_${windowSize}_${index}`,
  kind: "spectrum",
  spectrumWindowSize: windowSize,
  target: { kind: "port", nodeId: "sat", portId: "out", portKind: "out" }
});

const createCases = (): RenderCase[] => [
  { id: "baseline-no-probe", captureProbes: [] },
  { id: "scope-probe", captureProbes: [createScopeProbe()] },
  { id: "spectrum-256", captureProbes: [createSpectrumProbe(256)] },
  { id: "spectrum-1024", captureProbes: [createSpectrumProbe(1024)] },
  { id: "spectrum-2048", captureProbes: [createSpectrumProbe(2048)] },
  {
    id: "two-spectrum-1024",
    captureProbes: [createSpectrumProbe(1024, 0), createSpectrumProbe(1024, 1)]
  }
];

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
};

const summarizeCpuProfile = (profile: CpuProfile) => {
  const selfMicrosByNodeId = new Map<number, number>();
  if (profile.samples?.length && profile.timeDeltas?.length) {
    for (let index = 0; index < profile.samples.length; index += 1) {
      const nodeId = profile.samples[index];
      selfMicrosByNodeId.set(nodeId, (selfMicrosByNodeId.get(nodeId) ?? 0) + (profile.timeDeltas[index] ?? 0));
    }
  } else {
    for (const node of profile.nodes) {
      selfMicrosByNodeId.set(node.id, node.hitCount ?? 0);
    }
  }

  return profile.nodes
    .map((node) => {
      const frame = node.callFrame;
      const name = frame.functionName || "(anonymous)";
      const url = frame.url ? path.relative(process.cwd(), frame.url) : "";
      return {
        name,
        url,
        line: typeof frame.lineNumber === "number" ? frame.lineNumber + 1 : undefined,
        selfMs: (selfMicrosByNodeId.get(node.id) ?? 0) / 1000
      };
    })
    .filter((entry) => entry.selfMs > 0)
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, 25);
};

const runCase = async (
  createWasmRenderer: (config: unknown) => {
    port: { postMessage: (message: unknown) => void };
    startStream: (options: unknown) => unknown;
  },
  patch: Patch,
  renderCase: RenderCase
): Promise<CaseMetrics> => {
  const wasmBytes = readWasmBytes();
  const project = createProject(patch);
  const durationSamples = Math.floor(durationSeconds * sampleRate);
  const renderer = createWasmRenderer({
    processorOptions: {
      sampleRate,
      blockSize,
      project,
      wasmBytes
    }
  });

  const postMessageStats = {
    count: 0,
    cloneMs: 0,
    maxCloneMs: 0,
    liveCaptureCount: 0,
    finalCaptureCount: 0,
    maxSpectrumColumns: 0,
    maxSpectrumBins: 0,
    maxFinalSpectrumColumns: 0,
    maxFinalSpectrumBins: 0,
    maxFullResolutionSamples: 0
  };
  let blockPostMessageCount = 0;

  renderer.port.postMessage = (message: unknown) => {
    postMessageStats.count += 1;
    blockPostMessageCount += 1;
    const cloneStart = performance.now();
    if (includeStructuredClone && typeof structuredClone === "function") {
      structuredClone(message);
    }
    const cloneMs = performance.now() - cloneStart;
    postMessageStats.cloneMs += cloneMs;
    postMessageStats.maxCloneMs = Math.max(postMessageStats.maxCloneMs, cloneMs);

    const captures = (message as { captures?: Array<Record<string, unknown>> })?.captures ?? [];
    for (const capture of captures) {
      const spectrumFrames = capture.spectrumFrames as { columns?: unknown[]; binFrequencies?: unknown[] } | undefined;
      const finalSpectrum = capture.finalSpectrum as { columns?: unknown[]; binFrequencies?: unknown[] } | undefined;
      if (spectrumFrames) {
        postMessageStats.liveCaptureCount += 1;
        postMessageStats.maxSpectrumColumns = Math.max(
          postMessageStats.maxSpectrumColumns,
          spectrumFrames.columns?.length ?? 0
        );
        postMessageStats.maxSpectrumBins = Math.max(
          postMessageStats.maxSpectrumBins,
          spectrumFrames.binFrequencies?.length ?? 0
        );
      }
      if (finalSpectrum) {
        postMessageStats.finalCaptureCount += 1;
        postMessageStats.maxFinalSpectrumColumns = Math.max(
          postMessageStats.maxFinalSpectrumColumns,
          finalSpectrum.columns?.length ?? 0
        );
        postMessageStats.maxFinalSpectrumBins = Math.max(
          postMessageStats.maxFinalSpectrumBins,
          finalSpectrum.binFrequencies?.length ?? 0
        );
      }
      const fullResolutionSamples = capture.fullResolutionSamples as unknown[] | undefined;
      postMessageStats.maxFullResolutionSamples = Math.max(
        postMessageStats.maxFullResolutionSamples,
        fullResolutionSamples?.length ?? 0
      );
    }
  };

  const stream = renderer.startStream({
    project,
    songStartSample: 0,
    mode: "preview",
    durationSamples,
    captureDurationSamples: durationSamples,
    trackId: "track_1",
    previewId: `profile_${renderCase.id}`,
    events: createNoteEvents(durationSamples),
    captureProbes: renderCase.captureProbes,
    randomSeed: 0x1234_5678
  }) as { processBlock: (output: Float32Array[]) => boolean; stopped?: boolean } | null;

  if (!stream) {
    throw new Error(`Unable to start preview stream for ${renderCase.id}`);
  }

  const left = new Float32Array(blockSize);
  const right = new Float32Array(blockSize);
  const blockTimes: number[] = [];
  const overBudgetBlocks: Array<{ blockIndex: number; ms: number; postedMessages: number }> = [];
  const maxBlocks = Math.ceil(durationSamples / blockSize) + 768;

  for (let blockIndex = 0; blockIndex < maxBlocks; blockIndex += 1) {
    blockPostMessageCount = 0;
    const blockStart = performance.now();
    stream.processBlock([left, right]);
    const blockMs = performance.now() - blockStart;
    blockTimes.push(blockMs);
    if (blockMs > realtimeBudgetMs) {
      overBudgetBlocks.push({ blockIndex, ms: blockMs, postedMessages: blockPostMessageCount });
    }
    if (stream.stopped) {
      break;
    }
  }

  const total = blockTimes.reduce((sum, value) => sum + value, 0);
  return {
    id: renderCase.id,
    durationSeconds,
    blockCount: blockTimes.length,
    realtimeBudgetMs,
    processBlockMs: {
      total,
      average: total / Math.max(1, blockTimes.length),
      max: Math.max(...blockTimes),
      p95: percentile(blockTimes, 0.95),
      p99: percentile(blockTimes, 0.99),
      overBudgetCount: overBudgetBlocks.length,
      overBudgetBlocks: overBudgetBlocks.sort((left, right) => right.ms - left.ms).slice(0, 10)
    },
    postMessage: {
      ...postMessageStats,
      averageCloneMs: postMessageStats.cloneMs / Math.max(1, postMessageStats.count)
    }
  };
};

const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const createWasmRenderer = await loadRendererFactory();
  if (typeof createWasmRenderer !== "function") {
    throw new Error("Unable to load WASM worklet renderer factory.");
  }
  const patch = await loadBassPatch();
  const cases = createCases();

  for (let warmupIndex = 0; warmupIndex < warmupRuns; warmupIndex += 1) {
    for (const renderCase of cases) {
      await runCase(createWasmRenderer as never, patch, renderCase);
    }
  }
  globalThis.gc?.();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = slugify(`${label}-${stamp}`);
  const profilePath = path.join(outputDir, `${baseName}.cpuprofile`);
  const summaryPath = path.join(outputDir, `${baseName}.json`);

  const session = new inspector.Session();
  session.connect();
  await postInspector(session, "Profiler.enable");
  await postInspector(session, "Profiler.start");

  const wallStart = performance.now();
  const results = [];
  for (const renderCase of cases) {
    results.push(await runCase(createWasmRenderer as never, patch, renderCase));
  }
  const wallMs = performance.now() - wallStart;

  const stopped = await postInspector<{ profile: CpuProfile }>(session, "Profiler.stop");
  session.disconnect();
  fs.writeFileSync(profilePath, JSON.stringify(stopped.profile));

  const summary = {
    generatedAt: new Date().toISOString(),
    target: "WASM preview stream with patch workspace probe capture",
    durationSeconds,
    sampleRate,
    blockSize,
    realtimeBudgetMs,
    warmupRuns,
    structuredCloneInPostMessage: includeStructuredClone,
    wallMs,
    cases: results,
    cpuProfileHotspots: summarizeCpuProfile(stopped.profile),
    artifacts: {
      cpuProfile: profilePath,
      summary: summaryPath
    },
    guidance: {
      speedscope: "Open the .cpuprofile in https://www.speedscope.app/ for flamegraph-style inspection."
    }
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
