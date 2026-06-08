import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { serializeRustNodeParams, serializeTypeScriptNodeParams } from "./node-params-lib";

const outputs = [
  {
    path: path.join(process.cwd(), "rust/dsp-core/src/generated_node_params.rs"),
    contents: serializeRustNodeParams()
  },
  {
    path: path.join(process.cwd(), "src/lib/patch/generatedNodeParams.ts"),
    contents: serializeTypeScriptNodeParams()
  }
];

for (const output of outputs) {
  mkdirSync(path.dirname(output.path), { recursive: true });
  writeFileSync(output.path, output.contents);
}
