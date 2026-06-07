import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { serializeRustNodeParams } from "./rust-node-params-lib";

const outputFile = path.join(process.cwd(), "rust/dsp-core/src/generated_node_params.rs");

mkdirSync(path.dirname(outputFile), { recursive: true });
writeFileSync(outputFile, serializeRustNodeParams());
