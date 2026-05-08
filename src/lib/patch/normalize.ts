import { PATCH_CANVAS_MAX_ZOOM, PATCH_CANVAS_MIN_ZOOM } from "@/components/patch/patchCanvasConstants";
import { clamp, clamp01, clampRange } from "@/lib/numeric";
import { ensurePatchLayout } from "@/lib/patch/autoLayout";
import { createMacroBindingId, normalizeMacroBindingIds } from "@/lib/patch/macroBindings";
import { normalizeMacroKeyframeCount } from "@/lib/patch/macroKeyframes";
import { AUDIO_OUTPUT_PORT_TYPE_ID, createPatchOutputPort, getPatchPorts, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import { CURRENT_PATCH_SCHEMA_VERSION } from "@/lib/patch/schemaVersion";
import { getBundledPresetLineage, resolvePatchSource } from "@/lib/patch/source";
import { Patch, PatchConnection, PatchMacro, PatchMeta, PatchNode, PatchParamSliderRange, PatchPort } from "@/types/patch";

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
  return {
    id: asString(node.id, fallbackId),
    typeId: asString(node.typeId, ""),
    params: sanitizeParamMap(node.params)
  };
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
        id: createMacroBindingId(
          asString(macro.id, `macro_${index}`),
          asString(item.nodeId, ""),
          asString(item.paramId, "")
        ),
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

type LegacyPatchIo = {
  audioOutNodeId?: string;
};

type PatchWithLegacyOutput = Patch & {
  io?: LegacyPatchIo;
};

const ADSR_TIMING_PARAM_IDS = new Set(["attack", "decay", "release"]);
const LEGACY_COMPRESSOR_DERIVED_PARAM_IDS = new Set(["releaseMs", "makeupDb", "autoMakeup"]);

const secondsToMilliseconds = (value: number): number => value * 1000;
const legacyCompressorSquashFromThreshold = (thresholdDb: number): number =>
  clamp(Math.pow(clamp((-5 - thresholdDb) / 43, 0, 1), 1 / 1.08), 0, 1);
const legacyCompressorSquashFromRatio = (ratio: number): number =>
  clamp(Math.pow(clamp((ratio - 1) / 19, 0, 1), 1 / 1.45), 0, 1);

function legacyCompressorSquashFromParams(params: PatchNode["params"]): number {
  const squashCandidates: number[] = [];
  if (typeof params.squash === "number" && Number.isFinite(params.squash)) {
    squashCandidates.push(clamp01(params.squash));
  }
  if (typeof params.thresholdDb === "number" && Number.isFinite(params.thresholdDb)) {
    squashCandidates.push(legacyCompressorSquashFromThreshold(params.thresholdDb));
  }
  if (typeof params.ratio === "number" && Number.isFinite(params.ratio)) {
    squashCandidates.push(legacyCompressorSquashFromRatio(params.ratio));
  }
  return squashCandidates.length > 0
    ? squashCandidates.reduce((sum, value) => sum + value, 0) / squashCandidates.length
    : 0.5;
}

function migrateLegacyCompressorBindingValue(paramId: string, value: number): number | null {
  if (paramId === "squash") {
    return clamp01(value);
  }
  if (paramId === "thresholdDb") {
    return legacyCompressorSquashFromThreshold(value);
  }
  if (paramId === "ratio") {
    return legacyCompressorSquashFromRatio(value);
  }
  return null;
}

function mergeParamRange(
  ranges: Record<string, PatchParamSliderRange>,
  key: string,
  range: PatchParamSliderRange
) {
  const normalizedRange = clampRange(range.min, range.max);
  const existing = ranges[key];
  ranges[key] = existing
    ? clampRange(Math.min(existing.min, normalizedRange.min), Math.max(existing.max, normalizedRange.max))
    : normalizedRange;
}

function migrateLegacyAdsrTimingUnits(
  schemaVersion: number,
  nodes: PatchNode[],
  macros: PatchMacro[],
  paramRanges?: Record<string, PatchParamSliderRange>
): Pick<Patch, "nodes"> & { macros: PatchMacro[]; paramRanges?: Record<string, PatchParamSliderRange> } {
  const shouldMigrateTimingUnits = schemaVersion < 2;
  const shouldDefaultCurve = schemaVersion < CURRENT_PATCH_SCHEMA_VERSION;
  if (!shouldMigrateTimingUnits && !shouldDefaultCurve) {
    return { nodes, macros, paramRanges };
  }

  const adsrNodeIds = new Set(nodes.filter((node) => node.typeId === "ADSR").map((node) => node.id));
  if (adsrNodeIds.size === 0) {
    return { nodes, macros, paramRanges };
  }

  const migratedNodes = nodes.map((node) => {
    if (!adsrNodeIds.has(node.id)) {
      return node;
    }
    const params = { ...node.params };
    if (shouldMigrateTimingUnits) {
      for (const paramId of ADSR_TIMING_PARAM_IDS) {
        const value = params[paramId];
        if (typeof value === "number" && Number.isFinite(value)) {
          params[paramId] = secondsToMilliseconds(value);
        }
      }
    }
    if (shouldDefaultCurve && typeof params.curve !== "number") {
      params.curve = 0;
    }
    if (shouldDefaultCurve && typeof params.mode !== "string") {
      params.mode = "retrigger_from_current";
    }
    return { ...node, params };
  });

  const migratedMacros = macros.map((macro) => ({
    ...macro,
    bindings: macro.bindings.map((binding) => {
      if (!adsrNodeIds.has(binding.nodeId) || !ADSR_TIMING_PARAM_IDS.has(binding.paramId)) {
        return binding;
      }
      return {
        ...binding,
        min: binding.min === undefined ? undefined : secondsToMilliseconds(binding.min),
        max: binding.max === undefined ? undefined : secondsToMilliseconds(binding.max),
        points: binding.points?.map((point) => ({
          ...point,
          y: secondsToMilliseconds(point.y)
        }))
      };
    })
  }));

  const migratedParamRanges = paramRanges
    ? Object.fromEntries(
        Object.entries(paramRanges).map(([key, range]) => {
          const separatorIndex = key.indexOf(":");
          if (separatorIndex < 0) {
            return [key, range];
          }
          const nodeId = key.slice(0, separatorIndex);
          const paramId = key.slice(separatorIndex + 1);
          if (!adsrNodeIds.has(nodeId) || !ADSR_TIMING_PARAM_IDS.has(paramId)) {
            return [key, range];
          }
          return [key, { min: secondsToMilliseconds(range.min), max: secondsToMilliseconds(range.max) }];
        })
      )
    : undefined;

  return { nodes: migratedNodes, macros: migratedMacros, paramRanges: migratedParamRanges };
}

function migrateLegacyOverdriveParams(
  schemaVersion: number,
  nodes: PatchNode[],
  macros: PatchMacro[],
  paramRanges?: Record<string, PatchParamSliderRange>
): Pick<Patch, "nodes"> & { macros: PatchMacro[]; paramRanges?: Record<string, PatchParamSliderRange> } {
  if (schemaVersion >= 3) {
    return { nodes, macros, paramRanges };
  }

  const overdriveNodeIds = new Set(nodes.filter((node) => node.typeId === "Overdrive").map((node) => node.id));
  if (overdriveNodeIds.size === 0) {
    return { nodes, macros, paramRanges };
  }

  const migratedNodes = nodes.map((node) => {
    if (!overdriveNodeIds.has(node.id)) {
      return node;
    }
    const params = { ...node.params };
    if (typeof params.driveDb !== "number" && typeof params.gainDb === "number") {
      params.driveDb = params.gainDb;
    }
    delete params.gainDb;
    delete params.mix;
    return { ...node, params };
  });

  const migratedMacros = macros.map((macro) => ({
    ...macro,
    bindings: macro.bindings
      .filter((binding) => !overdriveNodeIds.has(binding.nodeId) || binding.paramId !== "mix")
      .map((binding) =>
        overdriveNodeIds.has(binding.nodeId) && binding.paramId === "gainDb"
          ? { ...binding, paramId: "driveDb" }
          : binding
      )
  }));

  const migratedParamRanges = paramRanges
    ? Object.fromEntries(
        Object.entries(paramRanges).flatMap(([key, range]) => {
          const separatorIndex = key.indexOf(":");
          if (separatorIndex < 0) {
            return [[key, range]];
          }
          const nodeId = key.slice(0, separatorIndex);
          const paramId = key.slice(separatorIndex + 1);
          if (!overdriveNodeIds.has(nodeId)) {
            return [[key, range]];
          }
          if (paramId === "mix") {
            return [];
          }
          if (paramId === "gainDb") {
            return [[`${nodeId}:driveDb`, range]];
          }
          return [[key, range]];
        })
      )
    : undefined;

  return { nodes: migratedNodes, macros: migratedMacros, paramRanges: migratedParamRanges };
}

function migrateLegacyCompressorParams(
  schemaVersion: number,
  nodes: PatchNode[],
  macros: PatchMacro[],
  paramRanges?: Record<string, PatchParamSliderRange>
): Pick<Patch, "nodes"> & { macros: PatchMacro[]; paramRanges?: Record<string, PatchParamSliderRange> } {
  if (schemaVersion >= 4) {
    return { nodes, macros, paramRanges };
  }

  const compressorNodeIds = new Set(nodes.filter((node) => node.typeId === "Compressor").map((node) => node.id));
  if (compressorNodeIds.size === 0) {
    return { nodes, macros, paramRanges };
  }

  const migratedNodes = nodes.map((node) => {
    if (!compressorNodeIds.has(node.id)) {
      return node;
    }
    const params = { ...node.params };
    params.squash = legacyCompressorSquashFromParams(params);
    if (typeof params.attackMs === "number" && Number.isFinite(params.attackMs)) {
      params.attackMs = clamp(params.attackMs, 10, 600);
    }
    delete params.thresholdDb;
    delete params.ratio;
    delete params.releaseMs;
    delete params.makeupDb;
    delete params.autoMakeup;
    return { ...node, params };
  });

  const migratedMacros = macros.map((macro) => {
    const seenBindings = new Set<string>();
    const bindings: PatchMacro["bindings"] = [];
    for (const binding of macro.bindings) {
      if (!compressorNodeIds.has(binding.nodeId)) {
        bindings.push(binding);
        continue;
      }
      if (LEGACY_COMPRESSOR_DERIVED_PARAM_IDS.has(binding.paramId)) {
        continue;
      }
      const migratedMin = migrateLegacyCompressorBindingValue(binding.paramId, binding.min ?? 0);
      const migratedMax = migrateLegacyCompressorBindingValue(binding.paramId, binding.max ?? 1);
      if (migratedMin === null || migratedMax === null) {
        bindings.push(binding);
        continue;
      }
      const bindingKey = `${binding.nodeId}:squash`;
      if (seenBindings.has(bindingKey)) {
        continue;
      }
      seenBindings.add(bindingKey);
      bindings.push({
        ...binding,
        paramId: "squash",
        min: Math.min(migratedMin, migratedMax),
        max: Math.max(migratedMin, migratedMax),
        points: binding.points
          ?.map((point) => {
            const y = migrateLegacyCompressorBindingValue(binding.paramId, point.y);
            return y === null ? null : { ...point, y };
          })
          .filter((point): point is NonNullable<typeof point> => point !== null)
      });
    }
    return { ...macro, bindings };
  });

  const migratedParamRanges = paramRanges
    ? Object.entries(paramRanges).reduce<Record<string, PatchParamSliderRange>>((ranges, [key, range]) => {
        const separatorIndex = key.indexOf(":");
        if (separatorIndex < 0) {
          mergeParamRange(ranges, key, range);
          return ranges;
        }
        const nodeId = key.slice(0, separatorIndex);
        const paramId = key.slice(separatorIndex + 1);
        if (!compressorNodeIds.has(nodeId)) {
          mergeParamRange(ranges, key, range);
          return ranges;
        }
        if (LEGACY_COMPRESSOR_DERIVED_PARAM_IDS.has(paramId)) {
          return ranges;
        }
        const min = migrateLegacyCompressorBindingValue(paramId, range.min);
        const max = migrateLegacyCompressorBindingValue(paramId, range.max);
        if (min === null || max === null) {
          mergeParamRange(ranges, key, range);
          return ranges;
        }
        mergeParamRange(ranges, `${nodeId}:squash`, { min, max });
        return ranges;
      }, {})
    : undefined;

  return { nodes: migratedNodes, macros: migratedMacros, paramRanges: migratedParamRanges };
}

export function normalizePatchOutputPort<T extends PatchWithLegacyOutput>(patch: T): Omit<T, "io"> {
  // TODO(output-port-legacy): Remove this compatibility adapter once all saved
  // projects/imports are guaranteed to declare the canonical `output` patch port.
  const ioOutputId = asString(patch.io?.audioOutNodeId, "");
  const legacyOutputNode =
    patch.nodes.find((node) => node.id === ioOutputId && node.typeId === AUDIO_OUTPUT_PORT_TYPE_ID) ??
    patch.nodes.find((node) => node.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  const existingOutputPort =
    getPatchPorts(patch).find((port) => port.id === ioOutputId && port.typeId === AUDIO_OUTPUT_PORT_TYPE_ID) ??
    getPatchPorts(patch).find((port) => port.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  const patchWithoutIo = { ...patch };
  delete patchWithoutIo.io;
  if (!existingOutputPort && !legacyOutputNode) {
    return patchWithoutIo;
  }
  const outputParams = existingOutputPort?.params ?? legacyOutputNode?.params;
  const canonicalOutputPort = createPatchOutputPort(outputParams);
  const legacyOutputId = existingOutputPort?.id ?? legacyOutputNode?.id ?? ioOutputId;
  const rewriteOutputId = (nodeId: string) =>
    nodeId === legacyOutputId || (ioOutputId.length > 0 && nodeId === ioOutputId) ? PATCH_OUTPUT_PORT_ID : nodeId;
  const outputPortById = new Map(
    getPatchPorts(patch)
      .filter((port) => port.typeId !== AUDIO_OUTPUT_PORT_TYPE_ID)
      .map((port) => [port.id, port] as const)
  );
  outputPortById.set(canonicalOutputPort.id, canonicalOutputPort);

  return {
    ...patchWithoutIo,
    nodes: patch.nodes.filter((node) => node.typeId !== AUDIO_OUTPUT_PORT_TYPE_ID),
    ports: [...outputPortById.values()],
    connections: patch.connections.map((connection) => ({
      ...connection,
      from: {
        ...connection.from,
        nodeId: rewriteOutputId(connection.from.nodeId)
      },
      to: {
        ...connection.to,
        nodeId: rewriteOutputId(connection.to.nodeId)
      }
    })),
    ui: {
      ...patch.ui,
      macros: patch.ui.macros.map((macro) => ({
        ...macro,
        bindings: macro.bindings.map((binding) => ({
          ...binding,
          nodeId: rewriteOutputId(binding.nodeId)
        }))
      })),
      paramRanges: patch.ui.paramRanges
        ? Object.fromEntries(
            Object.entries(patch.ui.paramRanges).map(([key, range]) => {
              const separatorIndex = key.indexOf(":");
              if (separatorIndex < 0) {
                return [key, range];
              }
              const nodeId = key.slice(0, separatorIndex);
              const paramId = key.slice(separatorIndex + 1);
              return [`${rewriteOutputId(nodeId)}:${paramId}`, range];
            })
          )
        : undefined
    },
    layout: {
      nodes: patch.layout.nodes.filter((node) => rewriteOutputId(node.nodeId) !== PATCH_OUTPUT_PORT_ID)
    }
  };
}

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

  const nodes = (Array.isArray(patch.nodes) ? patch.nodes : []).map((node, index) => sanitizePatchNode(node, `node_${index}`));
  const portsRaw = (Array.isArray(patch.ports) ? patch.ports : []).map((port, index) => sanitizePatchPort(port, `port_${index}`));
  const schemaVersion = Math.max(1, Math.floor(asFiniteNumber(patch.schemaVersion, 1)));
  const sanitizedMacros = (Array.isArray(ui.macros) ? ui.macros : []).map(sanitizePatchMacro);
  const sanitizedParamRanges = sanitizePatchParamRanges(ui.paramRanges);
  const adsrMigrated = migrateLegacyAdsrTimingUnits(schemaVersion, nodes, sanitizedMacros, sanitizedParamRanges);
  const overdriveMigrated = migrateLegacyOverdriveParams(schemaVersion, adsrMigrated.nodes, adsrMigrated.macros, adsrMigrated.paramRanges);
  const migrated = migrateLegacyCompressorParams(
    schemaVersion,
    overdriveMigrated.nodes,
    overdriveMigrated.macros,
    overdriveMigrated.paramRanges
  );

  return ensurePatchLayout(normalizeMacroBindingIds(normalizePatchOutputPort({
    schemaVersion: Math.max(schemaVersion, CURRENT_PATCH_SCHEMA_VERSION),
    id: patchId,
    name: asString(patch.name, options.fallbackName),
    meta,
    nodes: migrated.nodes,
    ports: portsRaw,
    connections: (Array.isArray(patch.connections) ? patch.connections : []).map((connection, index) =>
      sanitizePatchConnection(connection, `conn_${index}`)
    ),
    ui: {
      macros: migrated.macros,
      paramRanges: migrated.paramRanges,
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
      audioOutNodeId: asString(io.audioOutNodeId, "")
    }
  })));
}
