import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parsePresetManifestFromSource } from "./preset-manifest-lib.mjs";

const repoRoot = process.cwd();
const presetFile = path.join(repoRoot, "src/lib/patch/presets.ts");
const manifestFile = path.join(repoRoot, "src/lib/patch/presets.manifest.json");

if (!existsSync(manifestFile)) {
  console.error("Preset manifest check failed: src/lib/patch/presets.manifest.json is missing.");
  process.exit(1);
}

const source = readFileSync(presetFile, "utf8");
const expected = `${JSON.stringify(parsePresetManifestFromSource(source), null, 2)}\n`;
const actual = readFileSync(manifestFile, "utf8");

if (expected !== actual) {
  console.error("Preset manifest is out of date. Run `pnpm run presets:manifest`.");
  process.exit(1);
}

console.log("Preset manifest is up to date.");
