import { execFileSync } from "node:child_process";

export function runGit(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function tryGit(cwd, args) {
  try {
    return runGit(cwd, args);
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

export function parsePresetManifestFromSource(sourceText) {
  const manifest = [];
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
    const nameMatch = objectSource.match(/name:\s*"([^"]+)"/);
    const metaMatch = objectSource.match(/meta:\s*\{\s*source:\s*"preset",\s*presetId:\s*"([^"]+)",\s*presetVersion:\s*(\d+)\s*\}/);
    if (!metaMatch || !nameMatch) {
      continue;
    }

    const [, presetId, presetVersionText] = metaMatch;
    const macrosSource = extractMacrosArray(objectSource);
    const macroIds = Array.from(macrosSource.matchAll(/id:\s*"([^"]+)"/g))
      .map((entry) => entry[1])
      .filter((id) => id.startsWith("macro_"));

    manifest.push({
      presetId,
      presetVersion: Number.parseInt(presetVersionText, 10),
      name: nameMatch[1],
      macroIds
    });
  }

  manifest.sort((a, b) => a.presetId.localeCompare(b.presetId));
  return manifest;
}

export function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    args.set(key, next);
    i += 1;
  }
  return args;
}
