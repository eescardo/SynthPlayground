import { PATCH_CANVAS_MAX_ZOOM, PATCH_CANVAS_MIN_ZOOM } from "@/components/patch/patchCanvasConstants";
import { ensurePatchLayout } from "@/lib/patch/autoLayout";
import { normalizeMacroKeyframeCount } from "@/lib/patch/macroKeyframes";
import { getBundledPresetLineage, resolvePatchSource } from "@/lib/patch/source";
import { createEmptyProjectAssetLibrary, pickReferencedPatchAssets } from "@/lib/sampleAssetLibrary";
import { ProjectAssetLibrary } from "@/types/assets";
import { Patch, PatchConnection, PatchMacro, PatchMeta, PatchNode } from "@/types/patch";

export const PATCH_BUNDLE_KIND = "synth-playground-patch";
export const PATCH_BUNDLE_VERSION = 1;

interface SerializedPatchBundleV1 {
  kind: typeof PATCH_BUNDLE_KIND;
  version: typeof PATCH_BUNDLE_VERSION;
  patch: Patch;
  assets: ProjectAssetLibrary;
}

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

const sanitizePatchNode = (raw: unknown, index: number): PatchNode => {
  const node = isObject(raw) ? raw : {};
  return {
    id: asString(node.id, `node_${index}`),
    typeId: asString(node.typeId, ""),
    params: sanitizeParamMap(node.params)
  };
};

const sanitizePatchConnection = (raw: unknown, index: number): PatchConnection => {
  const connection = isObject(raw) ? raw : {};
  const from = isObject(connection.from) ? connection.from : {};
  const to = isObject(connection.to) ? connection.to : {};
  return {
    id: asString(connection.id, `conn_${index}`),
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

const sanitizePatch = (raw: unknown): Patch => {
  if (!isObject(raw)) {
    throw new Error("Patch payload must be an object");
  }

  const patch = raw;
  const ui = isObject(patch.ui) ? patch.ui : {};
  const layout = isObject(patch.layout) ? patch.layout : {};
  const io = isObject(patch.io) ? patch.io : {};
  const patchId = asString(patch.id, "imported_patch");
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
          source: "custom",
          basedOnPresetId:
            typeof (isObject(patch.meta) ? patch.meta.basedOnPresetId : undefined) === "string"
              ? asString(isObject(patch.meta) ? patch.meta.basedOnPresetId : undefined, "")
              : undefined,
          basedOnPresetVersion:
            asOptionalFiniteNumber(isObject(patch.meta) ? patch.meta.basedOnPresetVersion : undefined) === undefined
              ? undefined
              : Math.max(1, Math.floor(asFiniteNumber(isObject(patch.meta) ? patch.meta.basedOnPresetVersion : undefined, 1)))
        };

  return ensurePatchLayout({
    schemaVersion: Math.max(1, Math.floor(asFiniteNumber(patch.schemaVersion, 1))),
    id: patchId,
    name: asString(patch.name, "Imported Patch"),
    meta,
    nodes: (Array.isArray(patch.nodes) ? patch.nodes : []).map(sanitizePatchNode),
    connections: (Array.isArray(patch.connections) ? patch.connections : []).map(sanitizePatchConnection),
    ui: {
      macros: (Array.isArray(ui.macros) ? ui.macros : []).map(sanitizePatchMacro),
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
};

const sanitizeAssets = (raw: unknown): ProjectAssetLibrary => ({
  samplePlayerById: isObject(raw) && isObject(raw.samplePlayerById)
    ? Object.fromEntries(
        Object.entries(raw.samplePlayerById).filter((entry): entry is [string, string] => typeof entry[1] === "string")
      )
    : {}
});

const isSerializedPatchBundleV1 = (value: unknown): value is SerializedPatchBundleV1 =>
  isObject(value) &&
  value.kind === PATCH_BUNDLE_KIND &&
  value.version === PATCH_BUNDLE_VERSION &&
  isObject(value.patch) &&
  isObject(value.assets);

export const exportPatchToJson = (
  patch: Patch,
  assets: ProjectAssetLibrary = createEmptyProjectAssetLibrary()
): string =>
  JSON.stringify(
    {
      kind: PATCH_BUNDLE_KIND,
      version: PATCH_BUNDLE_VERSION,
      patch,
      assets: pickReferencedPatchAssets(patch, assets)
    } satisfies SerializedPatchBundleV1,
    null,
    2
  );

export const importPatchBundleFromJson = (json: string): { patch: Patch; assets: ProjectAssetLibrary } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (!isObject(parsed)) {
    throw new Error("Patch JSON root must be an object");
  }

  if (isSerializedPatchBundleV1(parsed)) {
    return {
      patch: sanitizePatch(parsed.patch),
      assets: sanitizeAssets(parsed.assets)
    };
  }

  return {
    patch: sanitizePatch(parsed),
    assets: createEmptyProjectAssetLibrary()
  };
};
