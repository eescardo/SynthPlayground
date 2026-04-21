import {
  AudioBenchmarkBundleResult,
  AudioBenchmarkMetricSummaries,
  AudioBenchmarkRunMetrics,
  AudioBenchmarkRunResult,
  AudioBenchmarkScenario,
  AudioBenchmarkScenarioResult,
  NumericMetricSummary
} from "@/audio/benchmarks/types";
import { createOfflineRenderProcessorJs, renderProjectOffline, renderProjectOfflineJs } from "@/audio/offline/renderProjectOffline";
import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample } from "@/lib/musicTiming";
import { SchedulerEvent } from "@/types/audio";
import { performance } from "node:perf_hooks";

const DEFAULT_WARMUP_RUNS = 1;
const BYTES_PER_MB = 1024 * 1024;

export type BenchmarkOptions = {
  runs: number;
  warmupRuns?: number;
  gitRef?: string;
  gitSha?: string;
  backend?: "wasm" | "js";
};

const numericSummary = (values: number[]): NumericMetricSummary => {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) * 0.5 : sorted[middle];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    stddev: Math.sqrt(variance)
  };
};

const summarizeRuns = (runs: AudioBenchmarkRunResult[]): AudioBenchmarkMetricSummaries => {
  const pick = (key: keyof AudioBenchmarkRunMetrics) => runs.map((run) => run.metrics[key]);
  return {
    compileProjectMs: numericSummary(pick("compileProjectMs")),
    scheduleEventsMs: numericSummary(pick("scheduleEventsMs")),
    transportSetupMs: numericSummary(pick("transportSetupMs")),
    renderSongMs: numericSummary(pick("renderSongMs")),
    realtimeFactor: numericSummary(pick("realtimeFactor")),
    eventsPerSecond: numericSummary(pick("eventsPerSecond")),
    cpuUserMs: numericSummary(pick("cpuUserMs")),
    cpuSystemMs: numericSummary(pick("cpuSystemMs")),
    rssDeltaMb: numericSummary(pick("rssDeltaMb")),
    heapUsedDeltaMb: numericSummary(pick("heapUsedDeltaMb")),
    peakHeapMb: numericSummary(pick("peakHeapMb")),
    renderedBlocks: numericSummary(pick("renderedBlocks")),
    renderedSamples: numericSummary(pick("renderedSamples")),
    eventCount: numericSummary(pick("eventCount")),
    noteEventCount: numericSummary(pick("noteEventCount")),
    macroEventCount: numericSummary(pick("macroEventCount")),
    outputAbsSum: numericSummary(pick("outputAbsSum"))
  };
};

const runSingleBenchmark = async (
  scenario: AudioBenchmarkScenario,
  backend: NonNullable<BenchmarkOptions["backend"]>
): Promise<AudioBenchmarkRunMetrics> => {
  const { project, config } = scenario;
  const totalSamples = Math.max(1, beatToSample(config.durationBeats, config.sampleRate, config.tempo));

  globalThis.gc?.();
  const compileStart = performance.now();
  createOfflineRenderProcessorJs(project, { sampleRate: config.sampleRate, blockSize: config.blockSize });
  const compileProjectMs = performance.now() - compileStart;

  globalThis.gc?.();
  const scheduleStart = performance.now();
  const events = collectEventsInWindow(project, { fromSample: 0, toSample: totalSamples + 1 }, { cueBeat: 0 });
  const scheduleEventsMs = performance.now() - scheduleStart;

  globalThis.gc?.();
  const transportStart = performance.now();
  createOfflineRenderProcessorJs(project, { sampleRate: config.sampleRate, blockSize: config.blockSize }).onMessage({
    type: "TRANSPORT",
    isPlaying: true,
    songStartSample: 0,
    events,
    sessionId: 1
  });
  const transportSetupMs = performance.now() - transportStart;

  globalThis.gc?.();
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const renderStart = performance.now();
  const renderResult = backend === "js"
    ? renderProjectOfflineJs(project, {
        sampleRate: config.sampleRate,
        blockSize: config.blockSize,
        durationSamples: totalSamples,
        events,
        sessionId: 1
      })
    : await renderProjectOffline(project, {
        sampleRate: config.sampleRate,
        blockSize: config.blockSize,
        durationSamples: totalSamples,
        events,
        sessionId: 1
      });
  const renderSongMs = performance.now() - renderStart;
  const cpuAfter = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();

  const noteEventCount = events.filter((event) => event.type === "NoteOn" || event.type === "NoteOff").length;
  const macroEventCount = events.filter((event) => event.type === "MacroChange").length;
  const audioSeconds = totalSamples / config.sampleRate;

  return {
    compileProjectMs,
    scheduleEventsMs,
    transportSetupMs,
    renderSongMs,
    realtimeFactor: renderSongMs > 0 ? audioSeconds / (renderSongMs / 1000) : 0,
    eventsPerSecond: renderSongMs > 0 ? events.length / (renderSongMs / 1000) : 0,
    cpuUserMs: cpuAfter.user / 1000,
    cpuSystemMs: cpuAfter.system / 1000,
    rssDeltaMb: (memoryAfter.rss - memoryBefore.rss) / BYTES_PER_MB,
    heapUsedDeltaMb: (memoryAfter.heapUsed - memoryBefore.heapUsed) / BYTES_PER_MB,
    peakHeapMb: renderResult.peakHeapMb,
    renderedBlocks: renderResult.renderedBlocks,
    renderedSamples: renderResult.renderedSamples,
    eventCount: events.length,
    noteEventCount,
    macroEventCount,
    outputAbsSum: renderResult.outputAbsSum
  };
};

export const runAudioBenchmarkScenario = async (
  scenario: AudioBenchmarkScenario,
  options: Pick<BenchmarkOptions, "runs" | "warmupRuns" | "backend">
): Promise<AudioBenchmarkScenarioResult> => {
  const warmupRuns = options.warmupRuns ?? DEFAULT_WARMUP_RUNS;
  const backend = options.backend ?? "wasm";
  for (let warmupIndex = 0; warmupIndex < warmupRuns; warmupIndex += 1) {
    await runSingleBenchmark(scenario, backend);
  }

  const runs: AudioBenchmarkRunResult[] = [];
  for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
    runs.push({
      index: runIndex + 1,
      metrics: await runSingleBenchmark(scenario, backend)
    });
  }

  return {
    scenario: scenario.config,
    runsRequested: options.runs,
    warmupRuns,
    summaries: summarizeRuns(runs),
    runs
  };
};

export const runAudioBenchmarkBundle = async (
  scenarios: AudioBenchmarkScenario[],
  options: BenchmarkOptions
): Promise<AudioBenchmarkBundleResult> => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  gitRef: options.gitRef,
  gitSha: options.gitSha,
  system: {
    node: process.version,
    platform: process.platform,
    arch: process.arch
  },
  scenarios: await Promise.all(scenarios.map((scenario) => runAudioBenchmarkScenario(scenario, options)))
});

export const countEventsByType = (events: SchedulerEvent[]) => ({
  noteEvents: events.filter((event) => event.type === "NoteOn" || event.type === "NoteOff").length,
  macroEvents: events.filter((event) => event.type === "MacroChange").length
});
