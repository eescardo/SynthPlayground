import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { serializeRustNodeParams } from "./rust-node-params-lib";

const outputFile = path.join(process.cwd(), "rust/dsp-core/src/generated_node_params.rs");

if (!existsSync(outputFile)) {
  console.error("Rust node parameter constants are missing. Run `pnpm run rust:node-params`.");
  process.exit(1);
}

const expected = serializeRustNodeParams();
const actual = readFileSync(outputFile, "utf8");

if (expected !== actual) {
  console.error("Rust node parameter constants are out of date. Run `pnpm run rust:node-params`.");
  process.exit(1);
}

console.log("Rust node parameter constants are up to date.");
