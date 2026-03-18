import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, runGit, tryGit } from "./preset-manifest-lib.mjs";

const repoRoot = process.cwd();
const manifestPath = "src/lib/patch/presets.manifest.json";
const manifestFile = path.join(repoRoot, manifestPath);
const args = parseArgs(process.argv.slice(2));
const baseRef = args.get("base-ref");

if (!baseRef) {
  console.error("Preset compatibility check failed: --base-ref is required.");
  process.exit(1);
}

const mergeBase = tryGit(repoRoot, ["merge-base", "HEAD", baseRef]);
if (!mergeBase) {
  console.error(`Preset compatibility check failed: unable to resolve merge-base against ${baseRef}.`);
  process.exit(1);
}

const baseManifestSource = tryGit(repoRoot, ["show", `${mergeBase}:${manifestPath}`]);
if (!baseManifestSource) {
  console.warn(`Preset compatibility check skipped: ${manifestPath} not found at baseline ${mergeBase}.`);
  process.exit(0);
}

const currentManifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const baseManifest = JSON.parse(baseManifestSource);
const baseById = new Map(baseManifest.map((entry) => [entry.presetId, entry]));
const errors = [];

for (const currentPreset of currentManifest) {
  const basePreset = baseById.get(currentPreset.presetId);
  if (!basePreset) {
    continue;
  }

  const missingMacroIds = basePreset.macroIds.filter((macroId) => !currentPreset.macroIds.includes(macroId));
  if (missingMacroIds.length > 0) {
    errors.push(
      `Preset ${currentPreset.presetId} removed macro IDs under the same presetId: ${missingMacroIds.join(", ")}. ` +
        `Macro IDs are append-only within a preset family. Use a new presetId for breaking changes.`
    );
  }

  if (!Number.isInteger(currentPreset.presetVersion) || currentPreset.presetVersion < 1) {
    errors.push(`Preset ${currentPreset.presetId} has invalid presetVersion ${String(currentPreset.presetVersion)}.`);
  }
}

if (errors.length > 0) {
  console.error("Preset compatibility check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Preset compatibility check passed against ${mergeBase.slice(0, 12)}.`);
