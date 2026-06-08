import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { serializeRustNodeParams, serializeTypeScriptNodeParams } from "./node-params-lib";

const outputs = [
  {
    label: "Rust node parameter constants",
    path: path.join(process.cwd(), "rust/dsp-core/src/generated_node_params.rs"),
    contents: serializeRustNodeParams()
  },
  {
    label: "TypeScript node parameter constants",
    path: path.join(process.cwd(), "src/lib/patch/generatedNodeParams.ts"),
    contents: serializeTypeScriptNodeParams()
  }
];

for (const output of outputs) {
  if (!existsSync(output.path)) {
    console.error(`${output.label} are missing. Run \`pnpm run node-params\`.`);
    process.exit(1);
  }

  const actual = readFileSync(output.path, "utf8");

  if (output.contents !== actual) {
    console.error(`${output.label} are out of date. Run \`pnpm run node-params\`.`);
    process.exit(1);
  }
}

console.log("Node parameter constants are up to date.");
