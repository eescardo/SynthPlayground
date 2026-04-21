import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourceDirs = [
  path.join(repoRoot, "src", "audio", "worklets"),
  path.join(repoRoot, "src", "audio", "renderers", "shared"),
  path.join(repoRoot, "src", "audio", "renderers", "wasm")
];
const publicDir = path.join(repoRoot, "public", "worklets");
const generatedFilePattern = /^(synth-worklet\.js|synth-(worklet|renderer)-.*\.(js|d\.ts))$/;

const walkFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const rewritePublicImportPaths = (source) =>
  source.replace(/(["'])(\.{1,2}\/[^"']+\.(?:js|d\.ts))\1/g, (_match, quote, specifier) => {
    return `${quote}./${path.basename(specifier)}${quote}`;
  });

fs.mkdirSync(publicDir, { recursive: true });

for (const filename of fs.readdirSync(publicDir)) {
  if (generatedFilePattern.test(filename)) {
    fs.rmSync(path.join(publicDir, filename), { force: true });
  }
}

const filesByName = new Map();
for (const sourceDir of sourceDirs) {
  for (const sourcePath of walkFiles(sourceDir)) {
    const filename = path.basename(sourcePath);
    if (!generatedFilePattern.test(filename)) {
      continue;
    }
    if (filesByName.has(filename)) {
      throw new Error(`Duplicate generated worklet filename detected: ${filename}`);
    }
    filesByName.set(filename, sourcePath);
  }
}

for (const [filename, sourcePath] of [...filesByName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const outputPath = path.join(publicDir, filename);
  if (filename.endsWith(".js")) {
    const relativeSource = path.relative(repoRoot, sourcePath);
    const generatedBanner = `// Generated from ${relativeSource} by scripts/worklets/sync-worklet-runtime.mjs.\n`;
    const source = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(outputPath, `${generatedBanner}${rewritePublicImportPaths(source)}`);
    continue;
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  fs.writeFileSync(outputPath, rewritePublicImportPaths(source));
}
