import { moduleRegistry } from "@/lib/patch/moduleRegistry";

const GENERATED_BANNER = `// Generated from src/lib/patch/moduleRegistry.ts by scripts/generate-node-params.ts.
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

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot generate numeric constant for non-finite value: ${value}`);
  }
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
};

const formatF32 = (value: number) => {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot generate Rust f32 constant for non-finite value: ${value}`);
  }
  if (Number.isInteger(value)) {
    return `${value.toFixed(1)}`;
  }
  return String(value);
};

const toTsPropertyKey = (value: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value));

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

export function serializeTypeScriptNodeParams() {
  const lines: string[] = [GENERATED_BANNER.trimEnd(), "", "export const NODE_PARAMS = {"];
  const modulesWithFloatParams = moduleRegistry
    .map((moduleSchema) => ({
      moduleSchema,
      floatParams: moduleSchema.params.filter((param) => param.type === "float")
    }))
    .filter((entry) => entry.floatParams.length > 0);

  modulesWithFloatParams.forEach(({ moduleSchema, floatParams }, moduleIndex) => {
    lines.push(`  ${toTsPropertyKey(toSnakeCase(moduleSchema.typeId))}: {`);
    floatParams.forEach((param, paramIndex) => {
      const smoothingMs = param.smoothing?.kind === "one_pole" ? formatNumber(param.smoothing.timeMs) : "null";
      const paramTerminator = paramIndex === floatParams.length - 1 ? "" : ",";
      lines.push(`    ${toTsPropertyKey(param.id)}: {`);
      lines.push(`      min: ${formatNumber(param.range.min)},`);
      lines.push(`      max: ${formatNumber(param.range.max)},`);
      lines.push(`      default: ${formatNumber(param.default)},`);
      lines.push(`      smoothingMs: ${smoothingMs}`);
      lines.push(`    }${paramTerminator}`);
    });
    const moduleTerminator = moduleIndex === modulesWithFloatParams.length - 1 ? "" : ",";
    lines.push(`  }${moduleTerminator}`);
  });

  lines.push("} as const;");

  return `${lines.join("\n").trimEnd()}\n`;
}
