import { compareBenchmarkBundles, renderBenchmarkComparisonMarkdown } from "@/audio/benchmarks/compare";
import { AudioBenchmarkBundleResult } from "@/audio/benchmarks/types";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const readFlag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const basePath = readFlag("--base");
const headPath = readFlag("--head");
const outputPath = readFlag("--output");
const markdownPath = readFlag("--markdown");

if (!headPath) {
  throw new Error("Usage: compare.ts [--base <base.json>] --head <head.json> [--output <comparison.json>] [--markdown <comment.md>]");
}

const base = basePath && fs.existsSync(basePath)
  ? (JSON.parse(fs.readFileSync(basePath, "utf8")) as AudioBenchmarkBundleResult)
  : null;
const head = JSON.parse(fs.readFileSync(headPath, "utf8")) as AudioBenchmarkBundleResult;
const comparison = compareBenchmarkBundles(base, head);
const markdown = renderBenchmarkComparisonMarkdown(comparison);
const json = JSON.stringify(comparison, null, 2);

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
}

if (markdownPath) {
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, markdown);
}

process.stdout.write(`${markdown}\n`);
