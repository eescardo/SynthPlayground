import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const pathsToRemove = [
  ".next",
  "out",
  "build",
  "artifacts/screenshots",
  "artifacts/traces",
  "artifacts/videos",
  "public/worklets/synth-worklet-runtime.js",
  "public/worklets/synth-worklet-runtime.d.ts",
  "public/wasm/pkg",
  "tsconfig.tsbuildinfo",
  "tsconfig.typecheck.tsbuildinfo"
];

for (const relativePath of pathsToRemove) {
  const absolutePath = path.join(repoRoot, relativePath);
  fs.rmSync(absolutePath, { recursive: true, force: true });
}

