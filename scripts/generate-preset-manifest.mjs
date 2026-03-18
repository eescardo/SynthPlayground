import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, parsePresetManifestFromSource } from "./preset-manifest-lib.mjs";

const repoRoot = process.cwd();
const presetFile = path.join(repoRoot, "src/lib/patch/presets.ts");
const manifestFile = path.join(repoRoot, "src/lib/patch/presets.manifest.json");
const args = parseArgs(process.argv.slice(2));
const shouldWrite = args.get("write") === "true";

const source = readFileSync(presetFile, "utf8");
const manifest = parsePresetManifestFromSource(source);
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (shouldWrite) {
  writeFileSync(manifestFile, serialized, "utf8");
  console.log(`Wrote preset manifest to ${path.relative(repoRoot, manifestFile)}.`);
} else {
  process.stdout.write(serialized);
}
