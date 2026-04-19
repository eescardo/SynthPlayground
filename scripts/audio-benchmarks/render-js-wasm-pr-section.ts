import fs from "node:fs";
import path from "node:path";
import { renderJsWasmPrSection, type JsWasmCompareResult } from "@/audio/benchmarks/renderJsWasmPrSection";

const args = process.argv.slice(2);

const readFlag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const basePath = readFlag("--base");
const headPath = readFlag("--head");
const outputPath = readFlag("--output");

if (!headPath || !outputPath) {
  throw new Error("Usage: render-js-wasm-pr-section.ts --head <path> [--base <path>] --output <path>");
}

const readJson = (filePath: string): JsWasmCompareResult =>
  JSON.parse(fs.readFileSync(filePath, "utf8")) as JsWasmCompareResult;

const markdown = renderJsWasmPrSection(readJson(headPath), basePath ? readJson(basePath) : null);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${markdown}\n`);
