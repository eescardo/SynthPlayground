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
