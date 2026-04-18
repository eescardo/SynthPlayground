import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const pathsToRemove = [
  ".next",
  ".next-ui-capture-3005",
  ".next-ui-capture-3006",
  ".next-ui-capture-3011",
  ".next-ui-capture-3400",
  ".next-ui-capture-3401",
  ".next-ui-capture-3402",
  ".next-ui-capture-3403",
  ".next-ui-capture-3404",
  ".next-ui-capture-3405",
  ".next-ui-capture-3406",
  ".next-ui-capture-3500",
  ".next-ui-capture-3501",
  ".next-ui-capture-3502",
  ".next-ui-capture-3503",
  ".next-ui-capture-3504",
  "out",
  "build",
  "artifacts/screenshots",
  "artifacts/traces",
  "artifacts/videos",
  "artifacts/audio-benchmarks",
  "public/wasm/pkg",
  "tsconfig.tsbuildinfo",
  "tsconfig.typecheck.tsbuildinfo"
];

for (const relativePath of pathsToRemove) {
  const absolutePath = path.join(repoRoot, relativePath);
  fs.rmSync(absolutePath, { recursive: true, force: true });
}

const publicWorkletsDir = path.join(repoRoot, "public", "worklets");
if (fs.existsSync(publicWorkletsDir)) {
  for (const filename of fs.readdirSync(publicWorkletsDir)) {
    if (filename === "synth-worklet.js") {
      continue;
    }
    if (/^synth-worklet-.*\.(js|d\.ts)$/.test(filename)) {
      fs.rmSync(path.join(publicWorkletsDir, filename), { force: true });
    }
  }
}
