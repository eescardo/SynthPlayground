import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAudioBenchmarkBundle } from "@/audio/benchmarks/runBenchmark";
import { createNamedBenchmarkScenario, createStressBenchmarkProject, DEFAULT_BENCHMARK_SCENARIO_IDS } from "@/audio/benchmarks/stressScenario";
import { createWasmRenderer } from "@/audio/renderers/wasm/wasmSynthRenderer";
import { TRANSPORT_INITIAL_PRIME_MS, transportMsToSamples } from "@/audio/transportScheduling";
import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample } from "@/lib/musicTiming";
import type { SynthStreamStartOptions } from "@/types/audio";

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

  it("runs benchmark scenarios sequentially so heavy renders do not contend", async () => {
    const wasmRendererMock = vi.mocked(createWasmRenderer);
    let activeRendererCreates = 0;
    let maxConcurrentRendererCreates = 0;
    wasmRendererMock.mockImplementation(async () => {
      activeRendererCreates += 1;
      maxConcurrentRendererCreates = Math.max(maxConcurrentRendererCreates, activeRendererCreates);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeRendererCreates -= 1;
      return {
        port: { onmessage: null, postMessage() {} },
        sampleRateInternal: 48000,
        blockSize: 128,
        project: null,
        configure() {},
        setDefaultProject() {},
        startStream() {
          return createMockStream();
        }
      } as unknown as Awaited<ReturnType<typeof createWasmRenderer>>;
    });

    const scenarios = [
      createNamedBenchmarkScenario("stress-3min-35tracks", {
        trackCount: 2,
        automatedTrackCount: 1,
        macroAutomationLanesPerTrack: 1,
        durationBeats: 2
      }),
      createNamedBenchmarkScenario("notes-only-3min-35tracks", {
        trackCount: 2,
        durationBeats: 2
      })
    ];

    await runAudioBenchmarkBundle(scenarios, {
      runs: 1,
      warmupRuns: 0,
      gitRef: "test"
    });

    expect(maxConcurrentRendererCreates).toBe(1);
  });

  it("primes only a short transport event window before full offline rendering", async () => {
    const wasmRendererMock = vi.mocked(createWasmRenderer);
    const startStreamEventCounts: number[] = [];
    wasmRendererMock.mockImplementation(async () => ({
      port: { onmessage: null, postMessage() {} },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: null,
      configure() {},
      setDefaultProject() {},
      startStream(options: SynthStreamStartOptions) {
        startStreamEventCounts.push(options.events.length);
        return createMockStream();
      }
    }) as unknown as Awaited<ReturnType<typeof createWasmRenderer>>);

    const scenario = createNamedBenchmarkScenario("stress-3min-35tracks", {
      trackCount: 4,
      automatedTrackCount: 2,
      macroAutomationLanesPerTrack: 1,
      durationBeats: 16,
      tempo: 100
    });

    await runAudioBenchmarkBundle([scenario], {
      runs: 1,
      warmupRuns: 0,
      gitRef: "test"
    });

    const totalSamples = beatToSample(
      scenario.config.durationBeats,
      scenario.config.sampleRate,
      scenario.config.tempo
    );
    const primedSamples = transportMsToSamples(TRANSPORT_INITIAL_PRIME_MS, scenario.config.sampleRate);
    const primedEvents = collectEventsInWindow(
      scenario.project,
      { fromSample: 0, toSample: primedSamples },
      { cueBeat: 0 }
    );
    const fullEvents = collectEventsInWindow(
      scenario.project,
      { fromSample: 0, toSample: totalSamples + 1 },
      { cueBeat: 0 }
    );

    expect(startStreamEventCounts).toHaveLength(2);
    expect(startStreamEventCounts[0]).toBe(primedEvents.length);
    expect(startStreamEventCounts[1]).toBe(fullEvents.length);
    expect(startStreamEventCounts[0]).toBeLessThan(startStreamEventCounts[1]);
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
