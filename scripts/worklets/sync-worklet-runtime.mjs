import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, "src", "audio", "worklets");
const publicDir = path.join(repoRoot, "public", "worklets");

const runtimeSourcePath = path.join(sourceDir, "synth-worklet-runtime.js");
const runtimeOutputPath = path.join(publicDir, "synth-worklet-runtime.js");
const typeSourcePath = path.join(sourceDir, "synth-worklet-runtime.d.ts");
const typeOutputPath = path.join(publicDir, "synth-worklet-runtime.d.ts");

fs.mkdirSync(publicDir, { recursive: true });

const generatedBanner =
  "// Generated from src/audio/worklets/synth-worklet-runtime.js by scripts/worklets/sync-worklet-runtime.mjs.\n";

const runtimeSource = fs.readFileSync(runtimeSourcePath, "utf8");
fs.writeFileSync(runtimeOutputPath, `${generatedBanner}${runtimeSource}`);

fs.copyFileSync(typeSourcePath, typeOutputPath);
