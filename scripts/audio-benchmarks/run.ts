import { createStressBenchmarkProject } from "@/audio/benchmarks/stressScenario";
import { runAudioBenchmarkSuite } from "@/audio/benchmarks/runBenchmark";
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
const trackCount = Math.max(1, Math.floor(parseNumberFlag("--tracks", 35)));
const automatedTrackCount = Math.max(0, Math.floor(parseNumberFlag("--automated-tracks", 18)));
const durationBeats = Math.max(1, parseNumberFlag("--duration-beats", 360));
const tempo = Math.max(20, parseNumberFlag("--tempo", 120));
const blockSize = Math.max(32, Math.floor(parseNumberFlag("--block-size", 128)));
const macroLanesPerTrack = Math.max(0, Math.floor(parseNumberFlag("--macro-lanes-per-track", 2)));

const scenario = createStressBenchmarkProject({
  trackCount,
  automatedTrackCount,
  durationBeats,
  tempo,
  blockSize,
  macroAutomationLanesPerTrack: macroLanesPerTrack
});

const result = runAudioBenchmarkSuite(scenario, {
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
