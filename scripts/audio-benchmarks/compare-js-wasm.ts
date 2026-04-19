import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createNamedBenchmarkScenario } from "@/audio/benchmarks/stressScenario";
import { createWasmParityScenario } from "@/audio/benchmarks/wasmParityScenario";
import { renderProjectOfflineJs } from "@/audio/offline/renderProjectOffline";
import { renderProjectOfflineWasm } from "@/audio/offline/renderProjectOfflineWasm";
import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample } from "@/lib/musicTiming";

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

const outputPath = readFlag("--output");
const scenarioId = readFlag("--scenario-id");
const runs = Math.max(1, Math.floor(parseNumberFlag("--runs", 3)));
const mediumTracks = Math.max(1, Math.floor(parseNumberFlag("--tracks", 8)));
const mediumDuration = Math.max(1, Math.floor(parseNumberFlag("--duration-beats", 96)));
const largeTracks = Math.max(mediumTracks, Math.floor(parseNumberFlag("--large-tracks", 24)));
const largeDuration = Math.max(mediumDuration, Math.floor(parseNumberFlag("--large-duration-beats", 256)));
const randomSeed = Math.floor(parseNumberFlag("--random-seed", 0x1234_5678)) >>> 0;

const summarize = (values: number[]) => ({
  min: Math.min(...values),
  max: Math.max(...values),
  mean: values.reduce((sum, value) => sum + value, 0) / values.length
});

const compareBuffersExactly = (leftA: Float32Array, leftB: Float32Array) => {
  if (leftA.length !== leftB.length) {
    return { exact: false, firstDiffIndex: 0, maxAbsDiff: Infinity };
  }
  let firstDiffIndex = -1;
  let maxAbsDiff = 0;
  for (let index = 0; index < leftA.length; index += 1) {
    const diff = Math.abs(leftA[index]! - leftB[index]!);
    if (diff > maxAbsDiff) {
      maxAbsDiff = diff;
    }
    if (firstDiffIndex < 0 && diff !== 0) {
      firstDiffIndex = index;
    }
  }
  return {
    exact: firstDiffIndex < 0,
    firstDiffIndex,
    maxAbsDiff
  };
};

interface RenderableScenario {
  config: {
    id: string;
    name: string;
    durationBeats: number;
    sampleRate: number;
    tempo: number;
    blockSize: number;
  };
  project: Parameters<typeof renderProjectOfflineJs>[0];
}

const runBackendBench = async (label: string, scenario: RenderableScenario, backend: "js" | "wasm", runsToUse: number) => {
  const totalSamples = beatToSample(scenario.config.durationBeats, scenario.config.sampleRate, scenario.config.tempo);
  const events = collectEventsInWindow(scenario.project, { fromSample: 0, toSample: totalSamples + 1 }, { cueBeat: 0 });
  const renderTimes: number[] = [];
  for (let runIndex = 0; runIndex < runsToUse; runIndex += 1) {
    globalThis.gc?.();
    const start = performance.now();
    if (backend === "js") {
      renderProjectOfflineJs(scenario.project, {
        sampleRate: scenario.config.sampleRate,
        blockSize: scenario.config.blockSize,
        durationSamples: totalSamples,
        events,
        sessionId: 1,
        randomSeed
      });
    } else {
      await renderProjectOfflineWasm(scenario.project, {
        sampleRate: scenario.config.sampleRate,
        blockSize: scenario.config.blockSize,
        durationSamples: totalSamples,
        events,
        sessionId: 1,
        randomSeed
      });
    }
    renderTimes.push(performance.now() - start);
  }
  return {
    label,
    backend,
    runs: runsToUse,
    renderSongMs: summarize(renderTimes)
  };
};

const main = async () => {
  const medium: RenderableScenario = scenarioId
    ? createNamedBenchmarkScenario(scenarioId, { id: scenarioId })
    : createWasmParityScenario({ id: "wasm-parity-medium", name: "WASM parity medium", trackCount: mediumTracks, durationBeats: mediumDuration });
  const large: RenderableScenario = scenarioId
    ? medium
    : createWasmParityScenario({ id: "wasm-parity-large", name: "WASM parity large", trackCount: largeTracks, durationBeats: largeDuration });

  const mediumSamples = beatToSample(medium.config.durationBeats, medium.config.sampleRate, medium.config.tempo);
  const mediumEvents = collectEventsInWindow(medium.project, { fromSample: 0, toSample: mediumSamples + 1 }, { cueBeat: 0 });
  const jsRender = renderProjectOfflineJs(medium.project, {
    sampleRate: medium.config.sampleRate,
    blockSize: medium.config.blockSize,
    durationSamples: mediumSamples,
    events: mediumEvents,
    sessionId: 1,
    randomSeed
  });
  const wasmRender = await renderProjectOfflineWasm(medium.project, {
    sampleRate: medium.config.sampleRate,
    blockSize: medium.config.blockSize,
    durationSamples: mediumSamples,
    events: mediumEvents,
    sessionId: 1,
    randomSeed
  });

  const mediumCompare = {
    scenario: medium.config,
    jsOutputAbsSum: jsRender.outputAbsSum,
    wasmOutputAbsSum: wasmRender.outputAbsSum,
    left: compareBuffersExactly(jsRender.left, wasmRender.left),
    right: compareBuffersExactly(jsRender.right, wasmRender.right)
  };

  const results = {
    generatedAt: new Date().toISOString(),
    scenarioId: medium.config.id,
    randomSeed,
    exactParity: mediumCompare.left.exact && mediumCompare.right.exact,
    mediumCompare,
    benchmarks: [
      await runBackendBench("medium", medium, "js", runs),
      await runBackendBench("medium", medium, "wasm", runs),
      ...(scenarioId
        ? []
        : [
            await runBackendBench("large", large, "js", runs),
            await runBackendBench("large", large, "wasm", runs)
          ])
    ]
  };

  const json = JSON.stringify(results, null, 2);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json);
  }
  process.stdout.write(`${json}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
