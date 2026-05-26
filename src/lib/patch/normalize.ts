import { PATCH_CANVAS_MAX_ZOOM, PATCH_CANVAS_MIN_ZOOM } from "@/components/patch/patchCanvasConstants";
import { clamp, clamp01, clampRange } from "@/lib/numeric";
import { ensurePatchLayout } from "@/lib/patch/autoLayout";
import { normalizeMacroKeyframeCount } from "@/lib/patch/macroKeyframes";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { CURRENT_PATCH_SCHEMA_VERSION } from "@/lib/patch/schemaVersion";
import { resolvePatchSource } from "@/lib/patch/source";
import {
  MacroBinding,
  Patch,
  PatchConnection,
  PatchMacro,
  PatchMeta,
  PatchNode,
  PatchParamSliderRange,
  ParamSchema,
  PatchPort
} from "@/types/patch";

interface PatchSchemaNormalizationPolicy {
  pruneUnknownParams: boolean;
  clampFloatParams: boolean;
  pruneInvalidParamRanges: boolean;
  clampParamRanges: boolean;
  pruneInvalidMacroBindings: boolean;
  clampMacroBindings: boolean;
}

const DEFAULT_PATCH_SCHEMA_NORMALIZATION_POLICY: PatchSchemaNormalizationPolicy = {
  pruneUnknownParams: false,
  clampFloatParams: false,
  pruneInvalidParamRanges: false,
  clampParamRanges: false,
  pruneInvalidMacroBindings: false,
  clampMacroBindings: false
};

export const PATCH_SCHEMA_NORMALIZATION_POLICIES = {
  Reverb: {
    pruneUnknownParams: true,
    clampFloatParams: true,
    pruneInvalidParamRanges: true,
    clampParamRanges: true,
    pruneInvalidMacroBindings: true,
    clampMacroBindings: true
  }
} satisfies Record<string, PatchSchemaNormalizationPolicy>;

const getPatchSchemaNormalizationPolicy = (typeId: string): PatchSchemaNormalizationPolicy =>
  PATCH_SCHEMA_NORMALIZATION_POLICIES[typeId as keyof typeof PATCH_SCHEMA_NORMALIZATION_POLICIES] ??
  DEFAULT_PATCH_SCHEMA_NORMALIZATION_POLICY;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asOptionalFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

const sanitizeParamMap = (raw: unknown): Record<string, number | string | boolean> => {
  if (!isObject(raw)) {
    return {};
  }
  const params: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      params[key] = value;
    }
  }
  return params;
};

const sanitizePatchNode = (raw: unknown, fallbackId: string): PatchNode => {
  const node = isObject(raw) ? raw : {};
  const typeId = asString(node.typeId, "");
  return {
    id: asString(node.id, fallbackId),
    typeId,
    params: sanitizeParamMap(node.params)
  };
};

const normalizePatchNodeParamsToCurrentSchema = <T extends PatchNode>(node: T): T => {
  const schema = getModuleSchema(node.typeId);
  if (!schema) {
    return node;
  }
  const policy = getPatchSchemaNormalizationPolicy(node.typeId);
  const params: PatchNode["params"] = { ...node.params };
  if (policy.pruneUnknownParams) {
    for (const paramId of Object.keys(params)) {
      if (!schema.params.some((param) => param.id === paramId)) {
        delete params[paramId];
      }
    }
  }
  for (const param of schema.params) {
    const value = node.params[param.id];
    if (param.type === "float") {
      params[param.id] =
        typeof value === "number" && Number.isFinite(value)
          ? policy.clampFloatParams
            ? clamp(value, param.range.min, param.range.max)
            : value
          : param.default;
    } else if (param.type === "enum") {
      params[param.id] = typeof value === "string" && param.options.includes(value) ? value : param.default;
    } else {
      params[param.id] = typeof value === "boolean" ? value : param.default;
    }
  }
  return { ...node, params };
};

const clampPatchParamRange = (range: PatchParamSliderRange, paramSchema: Extract<ParamSchema, { type: "float" }>) =>
  clampRange(
    clamp(range.min, paramSchema.range.min, paramSchema.range.max),
    clamp(range.max, paramSchema.range.min, paramSchema.range.max)
  );

const normalizePatchParamRangesToCurrentSchema = (
  nodes: PatchNode[],
  paramRanges?: Record<string, PatchParamSliderRange>
): Record<string, PatchParamSliderRange> | undefined => {
  if (!paramRanges) {
    return undefined;
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const ranges: Record<string, PatchParamSliderRange> = {};
  for (const [key, range] of Object.entries(paramRanges)) {
    const separatorIndex = key.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const nodeId = key.slice(0, separatorIndex);
    const paramId = key.slice(separatorIndex + 1);
    const node = nodeById.get(nodeId);
    const paramSchema = node ? getModuleSchema(node.typeId)?.params.find((param) => param.id === paramId) : undefined;
    if (!node) {
      ranges[key] = range;
      continue;
    }
    const policy = getPatchSchemaNormalizationPolicy(node.typeId);
    if (!paramSchema || paramSchema.type !== "float") {
      if (!policy.pruneInvalidParamRanges) {
        ranges[key] = range;
      }
      continue;
    }
    ranges[key] = policy.clampParamRanges ? clampPatchParamRange(range, paramSchema) : range;
  }
  return Object.keys(ranges).length > 0 ? ranges : undefined;
};

const clampMacroBindingToParamRange = (
  binding: MacroBinding,
  paramSchema: Extract<ParamSchema, { type: "float" }>
): MacroBinding => ({
  ...binding,
  min: binding.min === undefined ? undefined : clamp(binding.min, paramSchema.range.min, paramSchema.range.max),
  max: binding.max === undefined ? undefined : clamp(binding.max, paramSchema.range.min, paramSchema.range.max),
  points: binding.points?.map((point) => ({
    ...point,
    y: clamp(point.y, paramSchema.range.min, paramSchema.range.max)
  }))
});

const normalizeMacrosToCurrentSchema = (nodes: PatchNode[], macros: PatchMacro[]): PatchMacro[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  return macros.map((macro) => ({
    ...macro,
    bindings: macro.bindings.flatMap((binding) => {
      const node = nodeById.get(binding.nodeId);
      const paramSchema = node
        ? getModuleSchema(node.typeId)?.params.find((param) => param.id === binding.paramId)
        : undefined;
      if (!node) {
        return [binding];
      }
      const policy = getPatchSchemaNormalizationPolicy(node.typeId);
      if (!paramSchema || paramSchema.type !== "float") {
        return policy.pruneInvalidMacroBindings ? [] : [binding];
      }
      return [policy.clampMacroBindings ? clampMacroBindingToParamRange(binding, paramSchema) : binding];
    })
  }));
};

const sanitizePatchPort = (raw: unknown, fallbackId: string): PatchPort => {
  const port = isObject(raw) ? raw : {};
  return {
    id: asString(port.id, fallbackId),
    typeId: asString(port.typeId, "Output"),
    label: asString(port.label, "output"),
    direction: port.direction === "source" || port.direction === "sink" ? port.direction : undefined,
    params: sanitizeParamMap(port.params)
  };
};

const sanitizePatchConnection = (raw: unknown, fallbackId: string): PatchConnection => {
  const connection = isObject(raw) ? raw : {};
  const from = isObject(connection.from) ? connection.from : {};
  const to = isObject(connection.to) ? connection.to : {};
  return {
    id: asString(connection.id, fallbackId),
    from: {
      nodeId: asString(from.nodeId, ""),
      portId: asString(from.portId, "")
    },
    to: {
      nodeId: asString(to.nodeId, ""),
      portId: asString(to.portId, "")
    }
  };
};

const sanitizePatchParamRanges = (raw: unknown): Record<string, PatchParamSliderRange> | undefined => {
  if (!isObject(raw)) {
    return undefined;
  }
  const ranges: Record<string, PatchParamSliderRange> = {};
  for (const [key, value] of Object.entries(raw)) {
    const range = isObject(value) ? value : {};
    const min = asOptionalFiniteNumber(range.min);
    const max = asOptionalFiniteNumber(range.max);
    if (min !== undefined && max !== undefined) {
      ranges[key] = clampRange(min, max);
    }
  }
  return Object.keys(ranges).length > 0 ? ranges : undefined;
};

const sanitizePatchMacro = (raw: unknown, index: number): PatchMacro => {
  const macro = isObject(raw) ? raw : {};
  const bindingsRaw = Array.isArray(macro.bindings) ? macro.bindings : [];
  return {
    id: asString(macro.id, `macro_${index}`),
    name: asString(macro.name, `Macro ${index + 1}`),
    keyframeCount: normalizeMacroKeyframeCount(macro.keyframeCount),
    defaultNormalized: clamp01(asFiniteNumber(macro.defaultNormalized, 0.5)),
    bindings: bindingsRaw.map((binding) => {
      const item = isObject(binding) ? binding : {};
      const pointsRaw = Array.isArray(item.points) ? item.points : [];
      const points = pointsRaw
        .map((point) => {
          const entry = isObject(point) ? point : {};
          return {
            x: clamp01(asFiniteNumber(entry.x, 0)),
            y: asFiniteNumber(entry.y, 0)
          };
        })
        .sort((left, right) => left.x - right.x);

      return {
        nodeId: asString(item.nodeId, ""),
        paramId: asString(item.paramId, ""),
        map: item.map === "exp" ? "exp" : item.map === "piecewise" && points.length >= 2 ? "piecewise" : "linear",
        min: asFiniteNumber(item.min, 0),
        max: asFiniteNumber(item.max, 1),
        points: points.length >= 2 ? points : undefined
      };
    })
  };
};

export function normalizePatch(raw: unknown, options: { fallbackId: string; fallbackName: string }): Patch {
  const patch = isObject(raw) ? raw : {};
  const ui = isObject(patch.ui) ? patch.ui : {};
  const layout = isObject(patch.layout) ? patch.layout : {};
  const patchId = asString(patch.id, options.fallbackId);
  const patchMeta = isObject(patch.meta) ? patch.meta : {};
  const source = resolvePatchSource({
    id: patchId,
    meta:
      patchMeta.source === "preset" || patchMeta.source === "custom"
        ? {
            source: patchMeta.source
          }
        : undefined
  });
  const meta: PatchMeta =
    source === "preset" &&
    typeof patchMeta.presetId === "string" &&
    typeof patchMeta.presetVersion === "number" &&
    Number.isFinite(patchMeta.presetVersion)
      ? {
          source: "preset",
          presetId: patchMeta.presetId,
          presetVersion: Math.max(1, Math.floor(patchMeta.presetVersion))
        }
      : {
          source: "custom"
        };

  const nodes = (Array.isArray(patch.nodes) ? patch.nodes : []).map((node, index) =>
    sanitizePatchNode(node, `node_${index}`)
  );
  const portsRaw = (Array.isArray(patch.ports) ? patch.ports : []).map((port, index) =>
    sanitizePatchPort(port, `port_${index}`)
  );
  const schemaVersion = Math.max(1, Math.floor(asFiniteNumber(patch.schemaVersion, 1)));
  const sanitizedMacros = (Array.isArray(ui.macros) ? ui.macros : []).map(sanitizePatchMacro);
  const sanitizedParamRanges = sanitizePatchParamRanges(ui.paramRanges);
  const currentNodes = nodes.map(normalizePatchNodeParamsToCurrentSchema);
  const currentPorts = portsRaw.map(normalizePatchNodeParamsToCurrentSchema);
  const currentMacros = normalizeMacrosToCurrentSchema([...currentNodes, ...currentPorts], sanitizedMacros);
  const currentParamRanges = normalizePatchParamRangesToCurrentSchema(
    [...currentNodes, ...currentPorts],
    sanitizedParamRanges
  );

  return ensurePatchLayout({
    schemaVersion: Math.max(schemaVersion, CURRENT_PATCH_SCHEMA_VERSION),
    id: patchId,
    name: asString(patch.name, options.fallbackName),
    meta,
    nodes: currentNodes,
    ports: currentPorts,
    connections: (Array.isArray(patch.connections) ? patch.connections : []).map((connection, index) =>
      sanitizePatchConnection(connection, `conn_${index}`)
    ),
    ui: {
      macros: currentMacros,
      paramRanges: currentParamRanges,
      canvasZoom:
        asOptionalFiniteNumber(ui.canvasZoom) === undefined
          ? undefined
          : clamp(asFiniteNumber(ui.canvasZoom, 1), PATCH_CANVAS_MIN_ZOOM, PATCH_CANVAS_MAX_ZOOM)
    },
    layout: {
      nodes: (Array.isArray(layout.nodes) ? layout.nodes : []).map((entry) => {
        const node = isObject(entry) ? entry : {};
        return {
          nodeId: asString(node.nodeId, ""),
          x: Math.max(0, Math.floor(asFiniteNumber(node.x, 0))),
          y: Math.max(0, Math.floor(asFiniteNumber(node.y, 0)))
        };
      })
    }
  });
}
