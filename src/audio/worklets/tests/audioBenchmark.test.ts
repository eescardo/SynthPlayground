import { describe, expect, it } from "vitest";
import { createStressBenchmarkProject } from "@/audio/benchmarks/stressScenario";
import { runAudioBenchmarkSuite } from "@/audio/benchmarks/runBenchmark";
import { renderProjectOffline } from "@/audio/offlineRender";
import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample } from "@/lib/musicTiming";

describe("audio benchmark harness", () => {
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

  it("runs a tiny benchmark suite and produces positive timing and render metrics", () => {
    const scenario = createStressBenchmarkProject({
      trackCount: 4,
      automatedTrackCount: 2,
      macroAutomationLanesPerTrack: 1,
      durationBeats: 8,
      tempo: 100
    });

    const result = runAudioBenchmarkSuite(scenario, {
      runs: 1,
      warmupRuns: 0,
      gitRef: "test"
    });

    expect(result.runs).toHaveLength(1);
    expect(result.summaries.compileProjectMs.mean).toBeGreaterThanOrEqual(0);
    expect(result.summaries.scheduleEventsMs.mean).toBeGreaterThan(0);
    expect(result.summaries.renderSongMs.mean).toBeGreaterThan(0);
    expect(result.summaries.eventCount.mean).toBeGreaterThan(0);
    expect(result.summaries.outputAbsSum.mean).toBeGreaterThan(0);
  });

  it("renders offline from a precomputed event schedule", () => {
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
    const events = collectEventsInWindow(scenario.project, { fromSample: 0, toSample: durationSamples + 1 }, { cueBeat: 0 });
    const result = renderProjectOffline(scenario.project, {
      sampleRate: scenario.config.sampleRate,
      blockSize: scenario.config.blockSize,
      durationSamples,
      events
    });

    expect(result.renderedSamples).toBe(durationSamples);
    expect(result.renderedBlocks).toBeGreaterThan(0);
    expect(result.outputAbsSum).toBeGreaterThan(0);
    expect(result.left.some((sample) => Math.abs(sample) > 1e-6)).toBe(true);
  });
});
