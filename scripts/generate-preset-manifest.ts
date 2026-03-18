import { writeFileSync } from "node:fs";
import path from "node:path";

import { serializePresetManifest } from "./preset-manifest-lib";

const repoRoot = process.cwd();
const manifestFile = path.join(repoRoot, "src/lib/patch/presets.manifest.json");
const shouldWrite = process.argv.includes("--write");
const serialized = serializePresetManifest();

if (shouldWrite) {
  writeFileSync(manifestFile, serialized, "utf8");
  console.log(`Wrote preset manifest to ${path.relative(repoRoot, manifestFile)}.`);
} else {
  process.stdout.write(serialized);
}
