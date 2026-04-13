import { createNamedBenchmarkScenario, DEFAULT_BENCHMARK_SCENARIO_IDS } from "@/audio/benchmarks/stressScenario";
import { runAudioBenchmarkBundle } from "@/audio/benchmarks/runBenchmark";
import fs from "node:fs";
import path from "node:path";

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
const runs = Math.max(1, Math.floor(parseNumberFlag("--runs", 5)));
const warmupRuns = Math.max(0, Math.floor(parseNumberFlag("--warmup-runs", 1)));
const trackCount = readFlag("--tracks");
const automatedTrackCount = readFlag("--automated-tracks");
const durationBeats = readFlag("--duration-beats");
const tempo = readFlag("--tempo");
const blockSize = readFlag("--block-size");
const macroLanesPerTrack = readFlag("--macro-lanes-per-track");
const scenarioArg = readFlag("--scenario", "all") ?? "all";

const scenarioIds = scenarioArg === "all"
  ? DEFAULT_BENCHMARK_SCENARIO_IDS
  : scenarioArg.split(",").map((value) => value.trim()).filter(Boolean);

const scenarioOverrides = {
  ...(trackCount !== undefined ? { trackCount: Math.max(1, Math.floor(Number(trackCount))) } : {}),
  ...(automatedTrackCount !== undefined ? { automatedTrackCount: Math.max(0, Math.floor(Number(automatedTrackCount))) } : {}),
  ...(durationBeats !== undefined ? { durationBeats: Math.max(1, Number(durationBeats)) } : {}),
  ...(tempo !== undefined ? { tempo: Math.max(20, Number(tempo)) } : {}),
  ...(blockSize !== undefined ? { blockSize: Math.max(32, Math.floor(Number(blockSize))) } : {}),
  ...(macroLanesPerTrack !== undefined ? { macroAutomationLanesPerTrack: Math.max(0, Math.floor(Number(macroLanesPerTrack))) } : {})
};

const scenarios = scenarioIds.map((scenarioId) => createNamedBenchmarkScenario(scenarioId, scenarioOverrides));
const result = runAudioBenchmarkBundle(scenarios, {
  runs,
  warmupRuns,
  gitRef: process.env.GITHUB_REF_NAME ?? process.env.BENCHMARK_GIT_REF,
  gitSha: process.env.GITHUB_SHA ?? process.env.BENCHMARK_GIT_SHA
});

const json = JSON.stringify(result, null, 2);
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
}

process.stdout.write(`${json}\n`);
