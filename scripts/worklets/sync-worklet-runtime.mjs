import fs from "node:fs";
import crypto from "node:crypto";
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

const contentHashFor = (source) => crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);

const rewritePublicImportPaths = (source, options = {}) =>
  source.replace(/(["'])(\.{1,2}\/[^"']+\.(?:js|d\.ts))\1/g, (_match, quote, specifier) => {
    const filename = path.basename(specifier);
    const version = options.versionByFilename?.get(filename);
    const versionSuffix = filename.endsWith(".js") && version ? `?v=${version}` : "";
    return `${quote}./${filename}${versionSuffix}${quote}`;
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

const versionByFilename = new Map(
  (() => {
    const jsFiles = [...filesByName.entries()]
      .filter(([filename]) => filename.endsWith(".js"))
      .sort((a, b) => a[0].localeCompare(b[0]));
    const graphHash = contentHashFor(
      jsFiles.map(([filename, sourcePath]) => `${filename}\n${fs.readFileSync(sourcePath, "utf8")}`).join("\n")
    );
    return jsFiles.map(([filename]) => [filename, graphHash]);
  })()
);

for (const [filename, sourcePath] of [...filesByName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const outputPath = path.join(publicDir, filename);
  if (filename.endsWith(".js")) {
    const relativeSource = path.relative(repoRoot, sourcePath);
    const generatedBanner = `// Generated from ${relativeSource} by scripts/worklets/sync-worklet-runtime.mjs.\n`;
    const source = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(outputPath, `${generatedBanner}${rewritePublicImportPaths(source, { versionByFilename })}`);
    continue;
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  fs.writeFileSync(outputPath, rewritePublicImportPaths(source));
}
