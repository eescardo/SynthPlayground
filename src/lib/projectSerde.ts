import { createId } from "@/lib/ids";
import { presetPatches } from "@/lib/patch/presets";
import { getBundledPresetLineage, resolvePatchSource } from "@/lib/patch/source";
import { validatePatch } from "@/lib/patch/validation";
import { Project, TrackFxSettings } from "@/types/music";
import { Patch, PatchConnection, PatchMacro, PatchMeta, PatchNode } from "@/types/patch";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asString = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const defaultTrackFx = (): TrackFxSettings => ({
  delayEnabled: false,
  reverbEnabled: false,
  saturationEnabled: false,
  compressorEnabled: false,
  delayMix: 0.2,
  reverbMix: 0.2,
  drive: 0.2,
  compression: 0.4
});

const sanitizeMacroValueMap = (raw: unknown): Record<string, number> => {
  if (!isObject(raw)) {
    return {};
  }
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      values[key] = clamp(value, 0, 1);
    }
  }
  return values;
};

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

const sanitizePatch = (raw: unknown, index: number): Patch => {
  const patch = isObject(raw) ? raw : {};
  const ui = isObject(patch.ui) ? patch.ui : {};
  const layout = isObject(patch.layout) ? patch.layout : {};
  const io = isObject(patch.io) ? patch.io : {};
  const patchId = asString(patch.id, `patch_${index}`);
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

  return {
    schemaVersion: Math.max(1, Math.floor(asFiniteNumber(patch.schemaVersion, 1))),
    id: patchId,
    name: asString(patch.name, `Patch ${index + 1}`),
    meta,
    nodes: (Array.isArray(patch.nodes) ? patch.nodes : []).map(sanitizePatchNode),
    connections: (Array.isArray(patch.connections) ? patch.connections : []).map(sanitizePatchConnection),
    ui: {
      macros: (Array.isArray(ui.macros) ? ui.macros : []).map(sanitizePatchMacro)
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
  };
};

export const exportProjectToJson = (project: Project): string => JSON.stringify(project, null, 2);

export const normalizeProject = (raw: unknown): Project => {
  if (!isObject(raw)) {
    throw new Error("Project root must be an object");
  }

  const patchesRaw = Array.isArray(raw.patches) ? raw.patches : [];
  const normalizedPatches = patchesRaw.map(sanitizePatch);
  const existingPatchIds = new Set(normalizedPatches.map((patch) => patch.id));
  const patches = [
    ...normalizedPatches,
    ...presetPatches
      .filter((patch) => !existingPatchIds.has(patch.id))
      .map((patch) => structuredClone(patch))
  ];
  if (patches.length === 0) {
    throw new Error("Project must include at least one patch");
  }

  for (const patch of patches) {
    const validation = validatePatch(patch);
    if (!validation.ok) {
      throw new Error(`Invalid patch "${patch.name}": ${validation.issues.map((issue) => issue.message).join("; ")}`);
    }
  }

  const globalRaw = isObject(raw.global) ? raw.global : {};
  const meter = globalRaw.meter === "3/4" ? "3/4" : "4/4";
  const gridBeats = asFiniteNumber(globalRaw.gridBeats, 0.25);
  const loopRaw = isObject(globalRaw.loop) ? globalRaw.loop : null;

  const patchIds = new Set(patches.map((patch) => patch.id));
  const fallbackPatchId = patches[0].id;
  const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks : [];
  const tracks = tracksRaw
    .map((entry, index) => {
      const track = isObject(entry) ? entry : {};
      const fxRaw = isObject(track.fx) ? track.fx : {};
      const notesRaw = Array.isArray(track.notes) ? track.notes : [];

      const notes = notesRaw
        .map((noteEntry) => {
          const note = isObject(noteEntry) ? noteEntry : {};
          const pitchStr = asString(note.pitchStr, "");
          const startBeat = asFiniteNumber(note.startBeat, Number.NaN);
          const durationBeats = asFiniteNumber(note.durationBeats, Number.NaN);
          if (!pitchStr || !Number.isFinite(startBeat) || !Number.isFinite(durationBeats) || durationBeats <= 0) {
            return null;
          }
          return {
            id: asString(note.id, createId("note")),
            pitchStr,
            startBeat: Math.max(0, startBeat),
            durationBeats,
            velocity: clamp(asFiniteNumber(note.velocity, 0.85), 0, 1)
          };
        })
        .filter((note): note is NonNullable<typeof note> => Boolean(note))
        .sort((a, b) => a.startBeat - b.startBeat);

      const rawPatchId = asString(track.instrumentPatchId, fallbackPatchId);
      return {
        id: asString(track.id, `track_${index}`),
        name: asString(track.name, `Track ${index + 1}`),
        instrumentPatchId: patchIds.has(rawPatchId) ? rawPatchId : fallbackPatchId,
        notes,
        macroValues: sanitizeMacroValueMap(track.macroValues),
        macroPanelExpanded: track.macroPanelExpanded !== false,
        mute: Boolean(track.mute),
        solo: Boolean(track.solo),
        fx: {
          delayEnabled: Boolean(fxRaw.delayEnabled),
          reverbEnabled: Boolean(fxRaw.reverbEnabled),
          saturationEnabled: Boolean(fxRaw.saturationEnabled),
          compressorEnabled: Boolean(fxRaw.compressorEnabled),
          delayMix: clamp(asFiniteNumber(fxRaw.delayMix, defaultTrackFx().delayMix), 0, 1),
          reverbMix: clamp(asFiniteNumber(fxRaw.reverbMix, defaultTrackFx().reverbMix), 0, 1),
          drive: clamp(asFiniteNumber(fxRaw.drive, defaultTrackFx().drive), 0, 1),
          compression: clamp(asFiniteNumber(fxRaw.compression, defaultTrackFx().compression), 0, 1)
        }
      };
    })
    .filter((track) => track.instrumentPatchId);
  if (tracks.length === 0) {
    throw new Error("Project must include at least one valid track");
  }

  const masterFxRaw = isObject(raw.masterFx) ? raw.masterFx : {};
  const now = Date.now();

  return {
    id: asString(raw.id, `project_${now}`),
    name: asString(raw.name, "Imported Project"),
    global: {
      sampleRate: 48000,
      tempo: clamp(asFiniteNumber(globalRaw.tempo, 120), 20, 400),
      meter,
      gridBeats: gridBeats > 0 ? gridBeats : 0.25,
      loop: loopRaw
        ? {
            startBeat: Math.max(0, asFiniteNumber(loopRaw.startBeat, 0)),
            endBeat: Math.max(0, asFiniteNumber(loopRaw.endBeat, 8)),
            enabled: Boolean(loopRaw.enabled)
          }
        : undefined
    },
    tracks,
    patches,
    masterFx: {
      compressorEnabled: Boolean(masterFxRaw.compressorEnabled),
      limiterEnabled: masterFxRaw.limiterEnabled !== false,
      makeupGain: asFiniteNumber(masterFxRaw.makeupGain, 0)
    },
    createdAt: asFiniteNumber(raw.createdAt, now),
    updatedAt: asFiniteNumber(raw.updatedAt, now)
  };
};

export const importProjectFromJson = (json: string): Project => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (!isObject(parsed)) {
    throw new Error("Project JSON root must be an object");
  }
  return normalizeProject(parsed);
};
