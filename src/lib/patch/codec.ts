import { PATCH_CANVAS_MAX_ZOOM, PATCH_CANVAS_MIN_ZOOM } from "@/components/patch/patchCanvasConstants";
import { ensurePatchLayout } from "@/lib/patch/autoLayout";
import { normalizeMacroKeyframeCount } from "@/lib/patch/macroKeyframes";
import { getBundledPresetLineage, resolvePatchSource } from "@/lib/patch/source";
import { Patch, PatchConnection, PatchMacro, PatchMeta, PatchNode, PatchParamSliderRange } from "@/types/patch";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asOptionalFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

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
  return {
    id: asString(node.id, fallbackId),
    typeId: asString(node.typeId, ""),
    params: sanitizeParamMap(node.params)
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
      ranges[key] = { min: Math.min(min, max), max: Math.max(min, max) };
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
    defaultNormalized: clamp(asFiniteNumber(macro.defaultNormalized, 0.5), 0, 1),
    bindings: bindingsRaw.map((binding, bindingIndex) => {
      const item = isObject(binding) ? binding : {};
      const pointsRaw = Array.isArray(item.points) ? item.points : [];
      const points = pointsRaw
        .map((point) => {
          const entry = isObject(point) ? point : {};
          return {
            x: clamp(asFiniteNumber(entry.x, 0), 0, 1),
            y: asFiniteNumber(entry.y, 0)
          };
        })
        .sort((left, right) => left.x - right.x);

      return {
        id: asString(item.id, `binding_${bindingIndex}`),
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

export function normalizePatch(
  raw: unknown,
  options: { fallbackId: string; fallbackName: string }
): Patch {
  const patch = isObject(raw) ? raw : {};
  const ui = isObject(patch.ui) ? patch.ui : {};
  const layout = isObject(patch.layout) ? patch.layout : {};
  const io = isObject(patch.io) ? patch.io : {};
  const patchId = asString(patch.id, options.fallbackId);
  const sourceProbe: Pick<PatchMeta, "source"> | undefined =
    isObject(patch.meta) && (patch.meta.source === "preset" || patch.meta.source === "custom")
      ? { source: patch.meta.source }
      : undefined;
  const source = resolvePatchSource({
    id: patchId,
    meta: sourceProbe
  });
  const bundledLineage = getBundledPresetLineage(patchId);
  const meta: PatchMeta =
    source === "preset"
      ? {
          source: "preset",
          presetId: asString(isObject(patch.meta) ? patch.meta.presetId : undefined, bundledLineage?.presetId ?? patchId),
          presetVersion: Math.max(
            1,
            Math.floor(
              asFiniteNumber(isObject(patch.meta) ? patch.meta.presetVersion : undefined, bundledLineage?.presetVersion ?? 1)
            )
          )
        }
      : {
          source: "custom"
        };

  return ensurePatchLayout({
    schemaVersion: Math.max(1, Math.floor(asFiniteNumber(patch.schemaVersion, 1))),
    id: patchId,
    name: asString(patch.name, options.fallbackName),
    meta,
    nodes: (Array.isArray(patch.nodes) ? patch.nodes : []).map((node, index) => sanitizePatchNode(node, `node_${index}`)),
    connections: (Array.isArray(patch.connections) ? patch.connections : []).map((connection, index) =>
      sanitizePatchConnection(connection, `conn_${index}`)
    ),
    ui: {
      macros: (Array.isArray(ui.macros) ? ui.macros : []).map(sanitizePatchMacro),
      paramRanges: sanitizePatchParamRanges(ui.paramRanges),
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
    },
    io: {
      audioOutNodeId: asString(io.audioOutNodeId, ""),
      audioOutPortId: asString(io.audioOutPortId, "out")
    }
  });
}
