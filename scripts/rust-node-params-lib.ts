import { moduleRegistry } from "@/lib/patch/moduleRegistry";

const GENERATED_BANNER = `// Generated from src/lib/patch/moduleRegistry.ts by scripts/generate-rust-node-params.ts.
// Do not edit by hand.

`;

const toSnakeCase = (value: string) =>
  value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const toScreamingSnakeCase = (value: string) => toSnakeCase(value).toUpperCase();

const formatF32 = (value: number) => {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot generate Rust f32 constant for non-finite value: ${value}`);
  }
  if (Number.isInteger(value)) {
    return `${value.toFixed(1)}`;
  }
  return String(value);
};

export function serializeRustNodeParams() {
  const lines: string[] = [GENERATED_BANNER.trimEnd(), "", "#![allow(dead_code)]", ""];

  for (const moduleSchema of moduleRegistry) {
    const floatParams = moduleSchema.params.filter((param) => param.type === "float");
    if (floatParams.length === 0) {
      continue;
    }

    lines.push(`pub(crate) mod ${toSnakeCase(moduleSchema.typeId)} {`);
    for (const param of floatParams) {
      const prefix = toScreamingSnakeCase(param.id);
      lines.push(`    pub(crate) const ${prefix}_MIN: f32 = ${formatF32(param.range.min)};`);
      lines.push(`    pub(crate) const ${prefix}_MAX: f32 = ${formatF32(param.range.max)};`);
      lines.push(`    pub(crate) const ${prefix}_DEFAULT: f32 = ${formatF32(param.default)};`);
      if (param.smoothing?.kind === "one_pole") {
        lines.push(`    pub(crate) const ${prefix}_SMOOTHING_MS: f32 = ${formatF32(param.smoothing.timeMs)};`);
      }
    }
    lines.push("}", "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
