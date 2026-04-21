import fs from "node:fs";
import path from "node:path";
import inspector from "node:inspector";
import { performance } from "node:perf_hooks";

import { createNamedBenchmarkScenario } from "@/audio/benchmarks/stressScenario";
import { createWasmParityScenario } from "@/audio/benchmarks/wasmParityScenario";
import { renderProjectOffline } from "@/audio/offline/renderProjectOffline";
import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample } from "@/lib/musicTiming";

type ProfileTree = Record<string, unknown>;

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

const scenarioId = readFlag("--scenario-id");
const outputDir = readFlag("--output-dir", "artifacts/audio-profiles")!;
const label = readFlag("--label");
const warmupRuns = Math.max(0, Math.floor(parseNumberFlag("--warmup-runs", 1)));
const mediumTracks = Math.max(1, Math.floor(parseNumberFlag("--tracks", 8)));
const mediumDuration = Math.max(1, Math.floor(parseNumberFlag("--duration-beats", 96)));
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
    id: "audio-profile-medium",
    name: "Audio profile medium",
    trackCount: mediumTracks,
    durationBeats: mediumDuration
  });
};

const buildOutputPaths = (scenario: RenderableScenario) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = slugify(label || `wasm-${scenario.config.id}-${stamp}`);
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
  const renderResult = await renderProjectOffline(scenario.project, {
    sampleRate: scenario.config.sampleRate,
    blockSize: scenario.config.blockSize,
    durationSamples,
    events,
    sessionId: 1,
    randomSeed,
    profilingEnabled: true
  });
  const renderSongMs = performance.now() - renderStart;

  return {
    durationSamples,
    events,
    scheduleEventsMs,
    renderSongMs,
    outputAbsSum: renderResult.outputAbsSum,
    renderedBlocks: renderResult.renderedBlocks,
    renderedSamples: renderResult.renderedSamples,
    profileStats: renderResult.profileStats ?? null
  };
};

const flattenNumericLeaves = (value: unknown, prefix = ""): Array<{ name: string; value: number }> => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return prefix ? [{ name: prefix, value }] : [];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as ProfileTree).flatMap(([key, child]) =>
    flattenNumericLeaves(child, prefix ? `${prefix}.${key}` : key)
  );
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
    backend: "wasm",
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
    wasmProfile: result.profileStats,
    wasmHotspots: flattenNumericLeaves(result.profileStats)
      .filter((entry) => entry.name.endsWith("_ms") && entry.value > 0)
      .sort((left, right) => right.value - left.value)
      .slice(0, 15),
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
