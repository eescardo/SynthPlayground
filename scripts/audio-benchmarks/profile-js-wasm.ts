import fs from "node:fs";
import path from "node:path";
import inspector from "node:inspector";
import { performance } from "node:perf_hooks";

import { createNamedBenchmarkScenario } from "@/audio/benchmarks/stressScenario";
import { createWasmParityScenario } from "@/audio/benchmarks/wasmParityScenario";
import { renderProjectOffline } from "@/audio/offlineRender";
import { renderProjectOfflineWasm } from "@/audio/wasm/renderProjectOfflineWasm";
import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample } from "@/lib/musicTiming";

type Backend = "js" | "wasm";

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

const slugify = (value: string) => value.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();

const backend = (readFlag("--backend", "js") === "wasm" ? "wasm" : "js") as Backend;
const scenarioId = readFlag("--scenario-id");
const outputDir = readFlag("--output-dir", "artifacts/audio-profiles")!;
const label = readFlag("--label");
const warmupRuns = Math.max(0, Math.floor(parseNumberFlag("--warmup-runs", 1)));
const mediumTracks = Math.max(1, Math.floor(parseNumberFlag("--tracks", 8)));
const mediumDuration = Math.max(1, Math.floor(parseNumberFlag("--duration-beats", 96)));
const largeTracks = Math.max(mediumTracks, Math.floor(parseNumberFlag("--large-tracks", 24)));
const largeDuration = Math.max(mediumDuration, Math.floor(parseNumberFlag("--large-duration-beats", 256)));
const randomSeed = Math.floor(parseNumberFlag("--random-seed", 0x1234_5678)) >>> 0;

interface RenderableScenario {
  config: {
    id: string;
    name: string;
    durationBeats: number;
    sampleRate: number;
    tempo: number;
    blockSize: number;
  };
  project: Parameters<typeof renderProjectOffline>[0];
}

const makeScenario = (): RenderableScenario => {
  if (scenarioId) {
    return createNamedBenchmarkScenario(scenarioId, { id: scenarioId });
  }
  return createWasmParityScenario({
    id: "wasm-parity-medium",
    name: "WASM parity medium",
    trackCount: mediumTracks,
    durationBeats: mediumDuration
  });
};

const buildOutputPaths = (scenario: RenderableScenario) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = slugify(label || `${backend}-${scenario.config.id}-${stamp}`);
  return {
    profilePath: path.join(outputDir, `${baseName}.cpuprofile`),
    summaryPath: path.join(outputDir, `${baseName}.json`)
  };
};

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

const renderScenario = async (scenario: RenderableScenario) => {
  const durationSamples = beatToSample(scenario.config.durationBeats, scenario.config.sampleRate, scenario.config.tempo);

  const scheduleStart = performance.now();
  const events = collectEventsInWindow(scenario.project, { fromSample: 0, toSample: durationSamples + 1 }, { cueBeat: 0 });
  const scheduleEventsMs = performance.now() - scheduleStart;

  const renderStart = performance.now();
  const renderResult = backend === "js"
    ? renderProjectOffline(scenario.project, {
        sampleRate: scenario.config.sampleRate,
        blockSize: scenario.config.blockSize,
        durationSamples,
        events,
        sessionId: 1,
        randomSeed
      })
    : await renderProjectOfflineWasm(scenario.project, {
        sampleRate: scenario.config.sampleRate,
        blockSize: scenario.config.blockSize,
        durationSamples,
        events,
        sessionId: 1,
        randomSeed
      });
  const renderSongMs = performance.now() - renderStart;

  return {
    durationSamples,
    events,
    scheduleEventsMs,
    renderSongMs,
    outputAbsSum: renderResult.outputAbsSum,
    renderedBlocks: renderResult.renderedBlocks,
    renderedSamples: renderResult.renderedSamples
  };
};

const main = async () => {
  const scenario = makeScenario();
  const { profilePath, summaryPath } = buildOutputPaths(scenario);
  fs.mkdirSync(outputDir, { recursive: true });

  for (let warmupIndex = 0; warmupIndex < warmupRuns; warmupIndex += 1) {
    globalThis.gc?.();
    await renderScenario(scenario);
  }

  globalThis.gc?.();

  const session = new inspector.Session();
  session.connect();
  await postInspector(session, "Profiler.enable");
  await postInspector(session, "Profiler.start");

  const wallStart = performance.now();
  const result = await renderScenario(scenario);
  const totalWallMs = performance.now() - wallStart;

  const stopped = await postInspector<{ profile: unknown }>(session, "Profiler.stop");
  session.disconnect();

  fs.writeFileSync(profilePath, JSON.stringify(stopped.profile));

  const summary = {
    generatedAt: new Date().toISOString(),
    backend,
    scenario: scenario.config,
    randomSeed,
    warmupRuns,
    metrics: {
      scheduleEventsMs: result.scheduleEventsMs,
      renderSongMs: result.renderSongMs,
      totalWallMs,
      outputAbsSum: result.outputAbsSum,
      eventCount: result.events.length,
      renderedBlocks: result.renderedBlocks,
      renderedSamples: result.renderedSamples
    },
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
