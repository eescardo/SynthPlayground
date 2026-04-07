import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, "src", "audio", "worklets");
const publicDir = path.join(repoRoot, "public", "worklets");
const generatedFilePattern = /^synth-worklet-.*\.(js|d\.ts)$/;

fs.mkdirSync(publicDir, { recursive: true });

for (const filename of fs.readdirSync(publicDir)) {
  if (filename === "synth-worklet.js") {
    continue;
  }
  if (generatedFilePattern.test(filename)) {
    fs.rmSync(path.join(publicDir, filename), { force: true });
  }
}

for (const filename of fs.readdirSync(sourceDir)) {
  if (!generatedFilePattern.test(filename)) {
    continue;
  }

  const sourcePath = path.join(sourceDir, filename);
  const outputPath = path.join(publicDir, filename);
  if (filename.endsWith(".js")) {
    const generatedBanner = `// Generated from src/audio/worklets/${filename} by scripts/worklets/sync-worklet-runtime.mjs.\n`;
    const source = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(outputPath, `${generatedBanner}${source}`);
    continue;
  }

  fs.copyFileSync(sourcePath, outputPath);
}
