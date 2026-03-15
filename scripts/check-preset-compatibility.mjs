import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const presetFile = path.join(repoRoot, "src/lib/patch/presets.ts");

function runGit(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(args) {
  try {
    return runGit(args);
  } catch {
    return null;
  }
}

function findMatchingIndex(source, startIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    if (char === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        i += 1;
      }
      i += 1;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function extractMacrosArray(objectSource) {
  const macrosIndex = objectSource.indexOf("macros:");
  if (macrosIndex === -1) {
    return "[]";
  }
  const arrayStart = objectSource.indexOf("[", macrosIndex);
  if (arrayStart === -1) {
    return "[]";
  }
  const arrayEnd = findMatchingIndex(objectSource, arrayStart, "[", "]");
  if (arrayEnd === -1) {
    throw new Error("Unable to parse macros array in preset definition.");
  }
  return objectSource.slice(arrayStart, arrayEnd + 1);
}

function parsePresetManifest(sourceText) {
  const manifest = new Map();
  const functionPattern = /export const \w+Patch = \(\): Patch => \{/g;
  let match;

  while ((match = functionPattern.exec(sourceText)) !== null) {
    const functionStart = match.index;
    const returnIndex = sourceText.indexOf("return {", functionStart);
    if (returnIndex === -1) {
      continue;
    }
    const objectStart = sourceText.indexOf("{", returnIndex);
    const objectEnd = findMatchingIndex(sourceText, objectStart, "{", "}");
    if (objectEnd === -1) {
      throw new Error("Unable to parse preset object literal.");
    }

    const objectSource = sourceText.slice(objectStart, objectEnd + 1);
    const metaMatch = objectSource.match(/meta:\s*\{\s*source:\s*"preset",\s*presetId:\s*"([^"]+)",\s*presetVersion:\s*(\d+)\s*\}/);
    if (!metaMatch) {
      continue;
    }
    const [, presetId, presetVersionText] = metaMatch;
    const macrosSource = extractMacrosArray(objectSource);
    const macroIds = Array.from(macrosSource.matchAll(/id:\s*"([^"]+)"/g))
      .map((entry) => entry[1])
      .filter((id) => id.startsWith("macro_"));

    manifest.set(presetId, {
      presetId,
      presetVersion: Number.parseInt(presetVersionText, 10),
      macroIds
    });
  }

  return manifest;
}

function resolveBaseRef() {
  const envBase = process.env.PRESET_BASE_REF;
  if (envBase && tryGit(["rev-parse", "--verify", envBase])) {
    return tryGit(["merge-base", "HEAD", envBase]) ?? envBase;
  }

  const candidates = ["origin/main", "main", "origin/master", "master"];
  for (const candidate of candidates) {
    if (tryGit(["rev-parse", "--verify", candidate])) {
      const mergeBase = tryGit(["merge-base", "HEAD", candidate]);
      if (mergeBase) {
        return mergeBase;
      }
    }
  }

  return tryGit(["rev-parse", "HEAD~1"]);
}

if (!existsSync(presetFile)) {
  console.error("Preset compatibility check failed: src/lib/patch/presets.ts not found.");
  process.exit(1);
}

let currentSource = readFileSync(presetFile, "utf8");
let baseRef = resolveBaseRef();
if (!baseRef) {
  console.warn("Preset compatibility check skipped: no merge-base or previous commit found.");
  process.exit(0);
}

const baseSource = tryGit(["show", `${baseRef}:src/lib/patch/presets.ts`]);
if (!baseSource) {
  console.warn(`Preset compatibility check skipped: presets.ts not found at baseline ${baseRef}.`);
  process.exit(0);
}

const currentManifest = parsePresetManifest(currentSource);
const baseManifest = parsePresetManifest(baseSource);
const errors = [];

for (const [presetId, currentPreset] of currentManifest.entries()) {
  const basePreset = baseManifest.get(presetId);
  if (!basePreset) {
    continue;
  }

  const missingMacroIds = basePreset.macroIds.filter((macroId) => !currentPreset.macroIds.includes(macroId));
  if (missingMacroIds.length > 0) {
    errors.push(
      `Preset ${presetId} removed macro IDs under the same presetId: ${missingMacroIds.join(", ")}. ` +
        `Macro IDs are append-only within a preset family. Use a new presetId for breaking changes.`
    );
  }

  if (!Number.isInteger(currentPreset.presetVersion) || currentPreset.presetVersion < 1) {
    errors.push(`Preset ${presetId} has invalid presetVersion ${String(currentPreset.presetVersion)}.`);
  }
}

if (errors.length > 0) {
  console.error("Preset compatibility check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Preset compatibility check passed against ${baseRef.slice(0, 12)}.`);
