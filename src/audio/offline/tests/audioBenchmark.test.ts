import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAudioBenchmarkBundle } from "@/audio/benchmarks/runBenchmark";
import { createNamedBenchmarkScenario, createStressBenchmarkProject, DEFAULT_BENCHMARK_SCENARIO_IDS } from "@/audio/benchmarks/stressScenario";
import { beatToSample } from "@/lib/musicTiming";

const createMockStream = () => ({
  port: { onmessage: null, postMessage() {} },
  project: null,
  trackRuntimes: [],
  eventQueue: [],
  stopped: false,
  transportSessionId: 1,
  processBlock(output: Float32Array[]) {
    output[0].fill(0.25);
    output[1]?.fill(0.25);
    return true;
  },
  enqueueEvents() {},
  stop() {},
  getProfileStats() {
    return null;
  }
});

vi.mock("@/audio/renderers/wasm/wasmSynthRenderer", () => ({
  createWasmRenderer: vi.fn(async () => ({
    port: { onmessage: null, postMessage() {} },
    sampleRateInternal: 48000,
    blockSize: 128,
    project: null,
    configure() {},
    setDefaultProject() {},
    startStream() {
      return createMockStream();
    }
  }))
}));

describe("audio benchmark harness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the default benchmark scenario matrix", () => {
    expect(DEFAULT_BENCHMARK_SCENARIO_IDS).toEqual([
      "stress-3min-35tracks",
      "no-automation-3min-35tracks",
      "notes-only-3min-35tracks",
      "automation-heavy-low-track"
    ]);
  });

  it("builds a deterministic stress project that covers presets and automation lanes", () => {
    const scenario = createStressBenchmarkProject({
      trackCount: 7,
      automatedTrackCount: 4,
      macroAutomationLanesPerTrack: 1,
      durationBeats: 16
    });

    expect(scenario.project.tracks).toHaveLength(7);
    expect(new Set(scenario.project.tracks.map((track) => track.instrumentPatchId)).size).toBeGreaterThanOrEqual(7);
    expect(
      scenario.project.tracks
        .slice(0, 4)
        .some((track) => Object.keys(track.macroAutomations).length > 0)
    ).toBe(true);
  });

  it("builds the notes-only scenario without automation or enabled fx", () => {
    const scenario = createNamedBenchmarkScenario("notes-only-3min-35tracks", {
      trackCount: 4,
      durationBeats: 8
    });

    expect(scenario.project.masterFx.compressorEnabled).toBe(false);
    expect(scenario.project.masterFx.limiterEnabled).toBe(false);
    expect(scenario.project.tracks.every((track) => Object.keys(track.macroAutomations).length === 0)).toBe(true);
    expect(scenario.project.tracks.every((track) => !track.fx.delayEnabled && !track.fx.reverbEnabled && !track.fx.saturationEnabled && !track.fx.compressorEnabled)).toBe(true);
  });

  it("runs a tiny benchmark bundle and produces positive timing and render metrics", async () => {
    const scenarios = [
      createNamedBenchmarkScenario("stress-3min-35tracks", {
        trackCount: 4,
        automatedTrackCount: 2,
        macroAutomationLanesPerTrack: 1,
        durationBeats: 8,
        tempo: 100
      }),
      createNamedBenchmarkScenario("no-automation-3min-35tracks", {
        trackCount: 4,
        durationBeats: 8,
        tempo: 100
      })
    ];

    const result = await runAudioBenchmarkBundle(scenarios, {
      runs: 1,
      warmupRuns: 0,
      gitRef: "test"
    });

    expect(result.scenarios).toHaveLength(2);
    for (const scenarioResult of result.scenarios) {
      expect(scenarioResult.runs).toHaveLength(1);
      expect(scenarioResult.summaries.compileProjectMs.mean).toBeGreaterThanOrEqual(0);
      expect(scenarioResult.summaries.scheduleEventsMs.mean).toBeGreaterThan(0);
      expect(scenarioResult.summaries.renderSongMs.mean).toBeGreaterThan(0);
      expect(scenarioResult.summaries.eventCount.mean).toBeGreaterThan(0);
      expect(scenarioResult.summaries.outputAbsSum.mean).toBeGreaterThan(0);
    }
  });

  it("computes the expected offline render sample length for a short scenario", () => {
    const scenario = createStressBenchmarkProject({
      trackCount: 3,
      automatedTrackCount: 2,
      macroAutomationLanesPerTrack: 1,
      durationBeats: 4
    });

    const durationSamples = beatToSample(
      scenario.config.durationBeats,
      scenario.config.sampleRate,
      scenario.config.tempo
    );

    expect(durationSamples).toBeGreaterThan(0);
  });
});
