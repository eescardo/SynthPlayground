import { TRACK_VOLUME_AUTOMATION_ID } from "@/lib/macroAutomation";
import { AudioProject, SchedulerEvent } from "@/types/audio";
import { Patch } from "@/types/patch";
import { Track } from "@/types/music";

export interface WasmTrackFxSpec {
  delayEnabled: boolean;
  reverbEnabled: boolean;
  saturationEnabled: boolean;
  compressorEnabled: boolean;
  delayMix: number;
  reverbMix: number;
  drive: number;
  compression: number;
}

export interface WasmMasterFxSpec {
  compressorEnabled: boolean;
  limiterEnabled: boolean;
  makeupGain: number;
}

export interface WasmNodeSpec {
  id: string;
  typeId:
    | "CVTranspose"
    | "CVScaler"
    | "CVMixer2"
    | "VCO"
    | "KarplusStrong"
    | "LFO"
    | "ADSR"
    | "VCA"
    | "VCF"
    | "Mixer4"
    | "Noise"
    | "SamplePlayer"
    | "Delay"
    | "Reverb"
    | "Saturation"
    | "Overdrive"
    | "Compressor"
    | "Output";
  outIndex: number;
  inputs: Record<string, number>;
  params: Record<string, number | string | boolean>;
}

export interface WasmTrackSpec {
  trackIndex: number;
  trackId: string;
  volume: number;
  mute: boolean;
  fx: WasmTrackFxSpec;
  signalCount: number;
  hostSignalIndices: {
    pitch: number;
    gate: number;
    velocity: number;
    modWheel: number;
  };
  outputSignalIndex: number;
  nodes: WasmNodeSpec[];
}

export interface WasmProjectSpec {
  sampleRate: number;
  blockSize: number;
  tracks: WasmTrackSpec[];
  masterFx: WasmMasterFxSpec;
}

export interface WasmNoteOnEvent {
  type: "NoteOn";
  sampleTime: number;
  trackIndex: number;
  noteId: string;
  pitchVoct: number;
  velocity: number;
}

export interface WasmNoteOffEvent {
  type: "NoteOff";
  sampleTime: number;
  trackIndex: number;
  noteId: string;
}

export interface WasmParamChangeEvent {
  type: "ParamChange";
  sampleTime: number;
  trackIndex: number;
  nodeId: string;
  paramId: string;
  value: number | string | boolean;
}

export interface WasmTrackVolumeChangeEvent {
  type: "TrackVolumeChange";
  sampleTime: number;
  trackIndex: number;
  value: number;
}

export type WasmEvent = WasmNoteOnEvent | WasmNoteOffEvent | WasmParamChangeEvent | WasmTrackVolumeChangeEvent;

const HOST_NODE_IDS = {
  pitch: "$host.pitch",
  gate: "$host.gate",
  velocity: "$host.velocity",
  modWheel: "$host.modwheel"
} as const;

const HOST_NODE_ID_SET = new Set(Object.values(HOST_NODE_IDS));

const SUPPORTED_NODE_TYPES = new Set<WasmNodeSpec["typeId"]>([
  "CVTranspose",
  "CVScaler",
  "CVMixer2",
  "VCO",
  "KarplusStrong",
  "LFO",
  "ADSR",
  "VCA",
  "VCF",
  "Mixer4",
  "Noise",
  "SamplePlayer",
  "Delay",
  "Reverb",
  "Saturation",
  "Overdrive",
  "Compressor",
  "Output"
]);

const PORTS_IN_BY_TYPE: Record<WasmNodeSpec["typeId"], string[]> = {
  CVTranspose: ["in"],
  CVScaler: ["in"],
  CVMixer2: ["in1", "in2"],
  VCO: ["pitch", "fm", "pwm"],
  KarplusStrong: ["pitch", "gate", "excite"],
  LFO: ["fm"],
  ADSR: ["gate"],
  VCA: ["in", "gainCV"],
  VCF: ["in", "cutoffCV"],
  Mixer4: ["in1", "in2", "in3", "in4"],
  Noise: [],
  SamplePlayer: ["gate", "pitch"],
  Delay: ["in"],
  Reverb: ["in"],
  Saturation: ["in"],
  Overdrive: ["in"],
  Compressor: ["in"],
  Output: ["in"]
};

function assertPresent(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const compareNodeIdsTopologically = (patch: Patch): string[] => {
  const nodeById = new Map(patch.nodes.map((node) => [node.id, node]));
  const nodeIds = patch.nodes.map((node) => node.id);
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const adjacency = new Map(nodeIds.map((id) => [id, [] as string[]]));

  for (const connection of patch.connections) {
    if (!nodeById.has(connection.from.nodeId) || !nodeById.has(connection.to.nodeId)) {
      continue;
    }
    indegree.set(connection.to.nodeId, (indegree.get(connection.to.nodeId) ?? 0) + 1);
    adjacency.get(connection.from.nodeId)?.push(connection.to.nodeId);
  }

  const queue = [...nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0)];
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(next);
      }
    }
  }

  assertPresent(ordered.length === patch.nodes.length, `WASM compiler rejects cyclic patch ${patch.id}.`);
  return ordered;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const mapMacroBinding = (binding: NonNullable<Patch["ui"]>["macros"][number]["bindings"][number], normalized: number): number => {
  const n = clamp01(normalized);
  if (binding.map === "piecewise" && Array.isArray(binding.points) && binding.points.length >= 2) {
    const points = binding.points;
    if (n <= points[0]!.x) {
      return points[0]!.y;
    }
    if (n >= points[points.length - 1]!.x) {
      return points[points.length - 1]!.y;
    }
    let segmentIndex = 1;
    while (segmentIndex < points.length && n > points[segmentIndex]!.x) {
      segmentIndex += 1;
    }
    const left = points[segmentIndex - 1]!;
    const right = points[segmentIndex]!;
    const span = Math.max(right.x - left.x, 0.000001);
    const segmentNorm = (n - left.x) / span;
    return left.y + (right.y - left.y) * segmentNorm;
  }
  if (binding.map === "exp") {
    const min = Math.max(typeof binding.min === "number" ? binding.min : 0.000001, 0.000001);
    const max = typeof binding.max === "number" ? binding.max : min;
    return min * Math.pow(max / min, n);
  }
  const min = typeof binding.min === "number" ? binding.min : 0;
  const max = typeof binding.max === "number" ? binding.max : min;
  return min + (max - min) * n;
};

const applyInitialMacrosToNodeParams = (patch: Patch, track: Track, nodeParamTargets: Map<string, Record<string, number | string | boolean>>) => {
  for (const macro of patch.ui?.macros ?? []) {
    const normalized = typeof track.macroValues?.[macro.id] === "number"
      ? track.macroValues[macro.id]!
      : typeof macro.defaultNormalized === "number"
        ? macro.defaultNormalized
        : 0.5;
    for (const binding of macro.bindings) {
      const nodeParams = nodeParamTargets.get(binding.nodeId);
      if (!nodeParams) {
        continue;
      }
      nodeParams[binding.paramId] = mapMacroBinding(binding, normalized);
    }
  }
};

const compileTrackPatch = (patch: Patch, track: Track, trackIndex: number): WasmTrackSpec => {
  const nodeById = new Map(patch.nodes.map((node) => [node.id, node]));
  const nodeOrder = compareNodeIdsTopologically(patch);

  for (const node of patch.nodes) {
    assertPresent(SUPPORTED_NODE_TYPES.has(node.typeId as WasmNodeSpec["typeId"]), `Unsupported node type ${node.typeId} in patch ${patch.id}.`);
  }

  const outputNodeId = patch.io.audioOutNodeId;
  assertPresent(outputNodeId && nodeById.has(outputNodeId), `Invalid output node in patch ${patch.id}.`);

  let nextSignalIndex = 0;
  const outputIndexByKey = new Map<string, number>();
  const ensureOutputIndex = (nodeId: string, portId: string) => {
    const key = `${nodeId}:${portId}`;
    if (!outputIndexByKey.has(key)) {
      outputIndexByKey.set(key, nextSignalIndex);
      nextSignalIndex += 1;
    }
    return outputIndexByKey.get(key)!;
  };

  const hostSignalIndices = {
    pitch: ensureOutputIndex(HOST_NODE_IDS.pitch, "out"),
    gate: ensureOutputIndex(HOST_NODE_IDS.gate, "out"),
    velocity: ensureOutputIndex(HOST_NODE_IDS.velocity, "out"),
    modWheel: ensureOutputIndex(HOST_NODE_IDS.modWheel, "out")
  };

  const inputSourceByDestKey = new Map<string, number>();
  for (const connection of patch.connections) {
    const fromIsHost = HOST_NODE_ID_SET.has(connection.from.nodeId as (typeof HOST_NODE_IDS)[keyof typeof HOST_NODE_IDS]);
    if (!fromIsHost && !nodeById.has(connection.from.nodeId)) {
      continue;
    }
    if (!nodeById.has(connection.to.nodeId)) {
      continue;
    }
    const sourceSignalIndex = ensureOutputIndex(connection.from.nodeId, connection.from.portId);
    inputSourceByDestKey.set(`${connection.to.nodeId}:${connection.to.portId}`, sourceSignalIndex);
  }

  for (const node of patch.nodes) {
    ensureOutputIndex(node.id, "out");
  }

  const nodeParamTargets = new Map(
    patch.nodes.map((node) => [node.id, { ...(node.params || {}) } as Record<string, number | string | boolean>])
  );
  applyInitialMacrosToNodeParams(patch, track, nodeParamTargets);

  const nodes: WasmNodeSpec[] = nodeOrder.map((nodeId) => {
    const node = nodeById.get(nodeId)!;
    const typeId = node.typeId as WasmNodeSpec["typeId"];
    const inputs = Object.fromEntries(
      (PORTS_IN_BY_TYPE[typeId] ?? []).map((portId) => [portId, inputSourceByDestKey.get(`${node.id}:${portId}`) ?? -1])
    );
    return {
      id: node.id,
      typeId,
      outIndex: outputIndexByKey.get(`${node.id}:out`) ?? -1,
      inputs,
      params: nodeParamTargets.get(node.id) ?? {}
    };
  });

  return {
    trackIndex,
    trackId: track.id,
    volume: Number(track.volume ?? 1),
    mute: Boolean(track.mute),
    fx: {
      delayEnabled: Boolean(track.fx?.delayEnabled),
      reverbEnabled: Boolean(track.fx?.reverbEnabled),
      saturationEnabled: Boolean(track.fx?.saturationEnabled),
      compressorEnabled: Boolean(track.fx?.compressorEnabled),
      delayMix: Number(track.fx?.delayMix ?? 0),
      reverbMix: Number(track.fx?.reverbMix ?? 0),
      drive: Number(track.fx?.drive ?? 0),
      compression: Number(track.fx?.compression ?? 0)
    },
    signalCount: nextSignalIndex,
    hostSignalIndices,
    outputSignalIndex: outputIndexByKey.get(`${outputNodeId}:out`) ?? -1,
    nodes
  };
};

export const compileAudioProjectToWasmSubset = (
  project: AudioProject,
  options: { blockSize: number }
): WasmProjectSpec => {
  const patchById = new Map(project.patches.map((patch) => [patch.id, patch]));
  const tracks = project.tracks.map((track, trackIndex) => {
    const patch = patchById.get(track.instrumentPatchId);
    assertPresent(patch, `Missing patch ${track.instrumentPatchId} for track ${track.id}.`);
    return compileTrackPatch(patch, track, trackIndex);
  });

  return {
    sampleRate: project.global.sampleRate,
    blockSize: options.blockSize,
    tracks,
    masterFx: {
      compressorEnabled: Boolean(project.masterFx?.compressorEnabled),
      limiterEnabled: project.masterFx?.limiterEnabled !== false,
      makeupGain: Number(project.masterFx?.makeupGain ?? 0)
    }
  };
};

const macroBindingEvents = (
  patch: Patch,
  trackIndex: number,
  sampleTime: number,
  macroId: string,
  normalized: number
): WasmParamChangeEvent[] => {
  const macro = patch.ui?.macros?.find((entry) => entry.id === macroId);
  if (!macro) {
    return [];
  }
  return macro.bindings.map((binding) => ({
    type: "ParamChange",
    sampleTime,
    trackIndex,
    nodeId: binding.nodeId,
    paramId: binding.paramId,
    value: mapMacroBinding(binding, normalized)
  } satisfies WasmParamChangeEvent));
};

const EVENT_PRIORITY: Record<WasmEvent["type"], number> = {
  NoteOff: 0,
  ParamChange: 1,
  TrackVolumeChange: 1,
  NoteOn: 3
};

export const compileSchedulerEventsToWasmSubset = (
  project: AudioProject,
  projectSpec: WasmProjectSpec,
  events: SchedulerEvent[]
): WasmEvent[] => {
  const patchById = new Map(project.patches.map((patch) => [patch.id, patch]));
  const trackById = new Map(project.tracks.map((track, trackIndex) => [track.id, { track, trackIndex }]));
  const trackIndicesByPatchId = new Map<string, number[]>();
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex += 1) {
    const track = project.tracks[trackIndex]!;
    const existing = trackIndicesByPatchId.get(track.instrumentPatchId);
    if (existing) {
      existing.push(trackIndex);
    } else {
      trackIndicesByPatchId.set(track.instrumentPatchId, [trackIndex]);
    }
  }

  const compiled: WasmEvent[] = [];
  for (const event of events) {
    if (event.type === "NoteOn") {
      const trackEntry = trackById.get(event.trackId);
      assertPresent(trackEntry, `Unknown track ${event.trackId} for NoteOn.`);
      compiled.push({
        type: "NoteOn",
        sampleTime: event.sampleTime,
        trackIndex: trackEntry.trackIndex,
        noteId: event.noteId,
        pitchVoct: event.pitchVoct,
        velocity: event.velocity
      });
      continue;
    }

    if (event.type === "NoteOff") {
      const trackEntry = trackById.get(event.trackId);
      assertPresent(trackEntry, `Unknown track ${event.trackId} for NoteOff.`);
      compiled.push({
        type: "NoteOff",
        sampleTime: event.sampleTime,
        trackIndex: trackEntry.trackIndex,
        noteId: event.noteId
      });
      continue;
    }

    if (event.type === "ParamChange") {
      const trackIndices = trackIndicesByPatchId.get(event.patchId) ?? [];
      for (const trackIndex of trackIndices) {
        compiled.push({
          type: "ParamChange",
          sampleTime: event.sampleTime,
          trackIndex,
          nodeId: event.nodeId,
          paramId: event.paramId,
          value: event.value
        });
      }
      continue;
    }

    const trackEntry = trackById.get(event.trackId);
    assertPresent(trackEntry, `Unknown track ${event.trackId} for MacroChange.`);
    if (event.macroId === TRACK_VOLUME_AUTOMATION_ID) {
      compiled.push({
        type: "TrackVolumeChange",
        sampleTime: event.sampleTime,
        trackIndex: trackEntry.trackIndex,
        value: clamp01(event.normalized) * 2
      });
      continue;
    }

    const patch = patchById.get(trackEntry.track.instrumentPatchId);
    assertPresent(patch, `Missing patch ${trackEntry.track.instrumentPatchId} for track ${trackEntry.track.id}.`);
    compiled.push(...macroBindingEvents(patch, trackEntry.trackIndex, event.sampleTime, event.macroId, event.normalized));
  }

  compiled.sort((left, right) => {
    if (left.sampleTime !== right.sampleTime) {
      return left.sampleTime - right.sampleTime;
    }
    const priorityDelta = EVENT_PRIORITY[left.type] - EVENT_PRIORITY[right.type];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const leftId = left.type === "TrackVolumeChange" ? `${left.trackIndex}:volume` : `${left.trackIndex}:${left.type === "ParamChange" ? `${left.nodeId}:${left.paramId}` : left.noteId}`;
    const rightId = right.type === "TrackVolumeChange" ? `${right.trackIndex}:volume` : `${right.trackIndex}:${right.type === "ParamChange" ? `${right.nodeId}:${right.paramId}` : right.noteId}`;
    return leftId.localeCompare(rightId);
  });

  return compiled;
};
