import { TRACK_VOLUME_AUTOMATION_ID } from "../shared/synth-renderer-constants.js";

const HOST_NODE_IDS = {
  pitch: "$host.pitch",
  gate: "$host.gate",
  velocity: "$host.velocity",
  modWheel: "$host.modwheel"
};

const HOST_NODE_ID_SET = new Set(Object.values(HOST_NODE_IDS));

const SUPPORTED_NODE_TYPES = new Set([
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

const PORTS_IN_BY_TYPE = {
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

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const assertPresent = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createOutputPortFromLegacyNode = (node) =>
  node
    ? {
        id: node.id,
        typeId: "Output",
        params: { ...(node.params || {}) },
        label: "output"
      }
    : undefined;

const getPatchCompileNodes = (patch) => {
  const nodes = patch.nodes || [];
  const ports = patch.ports || [];
  const hasOutputPort = ports.some((port) => port.id === patch.io?.audioOutNodeId || port.typeId === "Output");
  if (hasOutputPort) {
    return [
      ...nodes.filter((node) => node.typeId !== "Output"),
      ...ports
    ];
  }
  const legacyOutputNode =
    nodes.find((node) => node.id === patch.io?.audioOutNodeId && node.typeId === "Output") ??
    nodes.find((node) => node.typeId === "Output");
  const outputPort = createOutputPortFromLegacyNode(legacyOutputNode);
  return outputPort ? [...nodes.filter((node) => node.typeId !== "Output"), outputPort] : nodes;
};

const compareNodeIdsTopologically = (patch) => {
  const patchNodes = getPatchCompileNodes(patch);
  const nodeById = new Map(patchNodes.map((node) => [node.id, node]));
  const nodeIds = patchNodes.map((node) => node.id);
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const adjacency = new Map(nodeIds.map((id) => [id, []]));

  for (const connection of patch.connections || []) {
    if (!nodeById.has(connection.from.nodeId) || !nodeById.has(connection.to.nodeId)) {
      continue;
    }
    indegree.set(connection.to.nodeId, (indegree.get(connection.to.nodeId) || 0) + 1);
    adjacency.get(connection.from.nodeId)?.push(connection.to.nodeId);
  }

  const queue = nodeIds.filter((id) => (indegree.get(id) || 0) === 0);
  const ordered = [];

  while (queue.length > 0) {
    const current = queue.shift();
    ordered.push(current);
    for (const next of adjacency.get(current) || []) {
      const nextIndegree = (indegree.get(next) || 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(next);
      }
    }
  }

  assertPresent(ordered.length === patchNodes.length, `WASM compiler rejects cyclic patch ${patch.id}.`);
  return ordered;
};

const mapMacroBinding = (binding, normalized) => {
  const n = clamp01(normalized);
  const interpolate = (leftValue, rightValue, amount) => {
    if (binding.map === "exp" && leftValue > 0 && rightValue > 0) {
      return leftValue * Math.pow(rightValue / leftValue, amount);
    }
    return leftValue + (rightValue - leftValue) * amount;
  };

  if (Array.isArray(binding.points) && binding.points.length >= 2) {
    const points = binding.points;
    if (n <= points[0].x) {
      return points[0].y;
    }
    if (n >= points[points.length - 1].x) {
      return points[points.length - 1].y;
    }
    let segmentIndex = 1;
    while (segmentIndex < points.length && n > points[segmentIndex].x) {
      segmentIndex += 1;
    }
    const left = points[segmentIndex - 1];
    const right = points[segmentIndex];
    const span = Math.max(right.x - left.x, 0.000001);
    const segmentNorm = (n - left.x) / span;
    return interpolate(left.y, right.y, segmentNorm);
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

const applyInitialMacrosToNodeParams = (patch, track, nodeParamTargets) => {
  for (const macro of patch.ui?.macros || []) {
    const normalized =
      typeof track.macroValues?.[macro.id] === "number"
        ? track.macroValues[macro.id]
        : typeof macro.defaultNormalized === "number"
          ? macro.defaultNormalized
          : 0.5;
    for (const binding of macro.bindings || []) {
      const nodeParams = nodeParamTargets.get(binding.nodeId);
      if (!nodeParams) {
        continue;
      }
      nodeParams[binding.paramId] = mapMacroBinding(binding, normalized);
    }
  }
};

const compileTrackPatch = (patch, track, trackIndex) => {
  const patchNodes = getPatchCompileNodes(patch);
  const nodeById = new Map(patchNodes.map((node) => [node.id, node]));
  const nodeOrder = compareNodeIdsTopologically(patch);

  for (const node of patchNodes) {
    assertPresent(SUPPORTED_NODE_TYPES.has(node.typeId), `Unsupported node type ${node.typeId} in patch ${patch.id}.`);
  }

  const outputNodeId = patch.io?.audioOutNodeId;
  assertPresent(outputNodeId && nodeById.has(outputNodeId), `Invalid output port in patch ${patch.id}.`);

  let nextSignalIndex = 0;
  const outputIndexByKey = new Map();
  const ensureOutputIndex = (nodeId, portId) => {
    const key = `${nodeId}:${portId}`;
    if (!outputIndexByKey.has(key)) {
      outputIndexByKey.set(key, nextSignalIndex);
      nextSignalIndex += 1;
    }
    return outputIndexByKey.get(key);
  };

  const hostSignalIndices = {
    pitch: ensureOutputIndex(HOST_NODE_IDS.pitch, "out"),
    gate: ensureOutputIndex(HOST_NODE_IDS.gate, "out"),
    velocity: ensureOutputIndex(HOST_NODE_IDS.velocity, "out"),
    modWheel: ensureOutputIndex(HOST_NODE_IDS.modWheel, "out")
  };

  const inputSourceByDestKey = new Map();
  for (const connection of patch.connections || []) {
    const fromIsHost = HOST_NODE_ID_SET.has(connection.from.nodeId);
    if (!fromIsHost && !nodeById.has(connection.from.nodeId)) {
      continue;
    }
    if (!nodeById.has(connection.to.nodeId)) {
      continue;
    }
    const sourceSignalIndex = ensureOutputIndex(connection.from.nodeId, connection.from.portId);
    inputSourceByDestKey.set(`${connection.to.nodeId}:${connection.to.portId}`, sourceSignalIndex);
  }

  for (const node of patchNodes) {
    ensureOutputIndex(node.id, "out");
  }

  const nodeParamTargets = new Map(patchNodes.map((node) => [node.id, { ...(node.params || {}) }]));
  applyInitialMacrosToNodeParams(patch, track, nodeParamTargets);

  const nodes = nodeOrder.map((nodeId) => {
    const node = nodeById.get(nodeId);
    const typeId = node.typeId;
    const inputs = Object.fromEntries(
      (PORTS_IN_BY_TYPE[typeId] || []).map((portId) => [portId, inputSourceByDestKey.get(`${node.id}:${portId}`) ?? -1])
    );
    return {
      id: node.id,
      typeId,
      outIndex: outputIndexByKey.get(`${node.id}:out`) ?? -1,
      inputs,
      params: nodeParamTargets.get(node.id) || {}
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
    nodes,
    __probeLookup: {
      outputIndexByKey: Object.fromEntries(outputIndexByKey.entries()),
      inputSourceByDestKey: Object.fromEntries(inputSourceByDestKey.entries())
    }
  };
};

export const compileAudioProjectToWasmSubsetCore = (project, options) => {
  const patchById = new Map((project.patches || []).map((patch) => [patch.id, patch]));
  const tracks = (project.tracks || []).map((track, trackIndex) => {
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

const EVENT_PRIORITY = {
  NoteOff: 0,
  ParamChange: 1,
  TrackVolumeChange: 1,
  NoteOn: 3
};

const compiledEventSortId = (event) =>
  event.type === "TrackVolumeChange"
    ? `${event.trackIndex}:volume`
    : `${event.trackIndex}:${event.type === "ParamChange" ? `${event.nodeId}:${event.paramId}` : event.noteId}`;

const compareCompiledEvents = (left, right) => {
  if (left.sampleTime !== right.sampleTime) {
    return left.sampleTime - right.sampleTime;
  }
  const priorityDelta = EVENT_PRIORITY[left.type] - EVENT_PRIORITY[right.type];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return compiledEventSortId(left).localeCompare(compiledEventSortId(right));
};

const areCompiledEventsSorted = (events) => {
  for (let index = 1; index < events.length; index += 1) {
    if (compareCompiledEvents(events[index - 1], events[index]) > 0) {
      return false;
    }
  }
  return true;
};

const eventCompilerContextCache = new WeakMap();

const createEventCompilerContext = (project) => {
  const patchById = new Map((project.patches || []).map((patch) => [patch.id, patch]));
  const trackById = new Map((project.tracks || []).map((track, trackIndex) => [track.id, { track, trackIndex }]));
  const trackIndicesByPatchId = new Map();
  const macroBindingsByTrackAndMacro = new Map();

  for (let trackIndex = 0; trackIndex < (project.tracks || []).length; trackIndex += 1) {
    const track = project.tracks[trackIndex];
    const existing = trackIndicesByPatchId.get(track.instrumentPatchId);
    if (existing) {
      existing.push(trackIndex);
    } else {
      trackIndicesByPatchId.set(track.instrumentPatchId, [trackIndex]);
    }
    const patch = patchById.get(track.instrumentPatchId);
    for (const macro of patch?.ui?.macros || []) {
      macroBindingsByTrackAndMacro.set(`${track.id}:${macro.id}`, {
        trackIndex,
        bindings: macro.bindings || []
      });
    }
  }

  return {
    trackById,
    trackIndicesByPatchId,
    macroBindingsByTrackAndMacro
  };
};

const getEventCompilerContext = (project, projectSpec) => {
  const cached = eventCompilerContextCache.get(projectSpec);
  // Renderer project plans are immutable, so projectSpec identity can safely
  // carry the precomputed event lookup tables for that planned snapshot.
  if (cached?.project === project) {
    return cached.context;
  }
  const context = createEventCompilerContext(project);
  eventCompilerContextCache.set(projectSpec, { project, context });
  return context;
};

const macroBindingEventsForBindings = (bindings, trackIndex, sampleTime, normalized) =>
  bindings.map((binding) => ({
    type: "ParamChange",
    sampleTime,
    trackIndex,
    nodeId: binding.nodeId,
    paramId: binding.paramId,
    value: mapMacroBinding(binding, normalized)
  }));

export const compileSchedulerEventsToWasmSubsetCore = (project, projectSpec, events) => {
  const {
    trackById,
    trackIndicesByPatchId,
    macroBindingsByTrackAndMacro
  } = getEventCompilerContext(project, projectSpec);

  const compiled = [];
  for (const event of events || []) {
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

    const macroBindings = macroBindingsByTrackAndMacro.get(`${event.trackId}:${event.macroId}`);
    if (!macroBindings) {
      continue;
    }
    compiled.push(...macroBindingEventsForBindings(
      macroBindings.bindings,
      macroBindings.trackIndex,
      event.sampleTime,
      event.normalized
    ));
  }

  if (!areCompiledEventsSorted(compiled)) {
    compiled.sort(compareCompiledEvents);
  }

  return compiled;
};

export const compilePreviewProbeCaptureRequestsCore = (project, projectSpec, trackId, captureProbes, durationSamples) => {
  if (!Array.isArray(captureProbes) || captureProbes.length === 0) {
    return [];
  }
  const trackIndex = (project.tracks || []).findIndex((track) => track.id === trackId);
  if (trackIndex < 0) {
    return [];
  }
  const trackSpec = projectSpec?.tracks?.[trackIndex];
  const lookup = trackSpec?.__probeLookup;
  if (!lookup) {
    return [];
  }

  const resolveSignalIndex = (target) => {
    if (!target || typeof target !== "object") {
      return -1;
    }
    if (target.kind === "connection") {
      const patchId = project.tracks?.[trackIndex]?.instrumentPatchId;
      const patch = project.patches?.find((entry) => entry.id === patchId);
      const connection = patch?.connections?.find((entry) => entry.id === target.connectionId);
      if (!connection) {
        return -1;
      }
      return lookup.outputIndexByKey?.[`${connection.from.nodeId}:${connection.from.portId}`] ?? -1;
    }
    if (target.kind === "port") {
      if (target.portKind === "out") {
        return lookup.outputIndexByKey?.[`${target.nodeId}:${target.portId}`] ?? -1;
      }
      return lookup.inputSourceByDestKey?.[`${target.nodeId}:${target.portId}`] ?? -1;
    }
    return -1;
  };

  return captureProbes
    .map((probe) => {
      const signalIndex = resolveSignalIndex(probe.target);
      if (signalIndex < 0) {
        return null;
      }
      return {
        probeId: probe.probeId,
        trackIndex,
        signalIndex,
        durationSamples: Math.max(0, Math.floor(durationSamples || 0))
      };
    })
    .filter(Boolean);
};
