import {
  DEFAULT_SAMPLE_RATE,
  HOST_NODES,
  MAX_VOICES,
  PARAM_SMOOTHING_MS,
  PORTS_IN_BY_TYPE,
  TRACK_VOLUME_AUTOMATION_ID,
  TRACK_VOLUME_RANGE
} from "./synth-worklet-constants.js";
import { clamp, dbToGain, onePoleStep, smoothingAlpha } from "./synth-worklet-math.js";
import { getNodeProcessor } from "./synth-worklet-node-processors.js";
import { compareScheduledEvents } from "../shared/synth-renderer-events.js";

const DEFAULT_RANDOM_SEED = 0x1234_5678;

class VoiceState {
  constructor(signalCount, blockSize, nodeCount) {
    this.active = false;
    this.noteId = null;
    this.lastTriggeredSampleTime = 0;
    this.rms = 0;
    this.host = {
      pitchVoct: 0,
      gate: 0,
      velocity: 0,
      modWheel: 0
    };
    this.nodeState = new Array(nodeCount).fill(null);
    this.paramState = new Array(nodeCount).fill(null);
    this.paramBuffers = new Array(nodeCount).fill(null);
    this.signalBuffers = new Array(signalCount).fill(0).map(() => new Float32Array(blockSize));
  }
}

export class TrackRuntime {
  constructor(track, patch, sampleRate, blockSize, randomSeed = DEFAULT_RANDOM_SEED) {
    this.track = track;
    this.patch = patch;
    this.sampleRate = sampleRate;
    this.sampleRateInv = 1 / sampleRate;
    this.blockSize = blockSize;
    this.baseRandomSeed = Number.isFinite(randomSeed) ? Number(randomSeed) >>> 0 : DEFAULT_RANDOM_SEED;
    this.randomState = this.baseRandomSeed;
    this.noteTriggerCount = 0;
    this.zeroBuffer = new Float32Array(blockSize);
    this.compiled = this.compilePatch(patch);
    this.voices = new Array(MAX_VOICES)
      .fill(0)
      .map(() => new VoiceState(this.compiled.signalCount, blockSize, this.compiled.nodeRuntimes.length));
    this.nodeRenderContext = {
      runtime: this,
      voice: null,
      runtimeNode: null,
      signalBuffers: null,
      startFrame: 0,
      endFrame: 0,
      out: null,
      read: null,
      hostPitchBuffer: null,
      hostGateBuffer: null
    };
    this.trackBuffer = new Float32Array(blockSize);
    this.delayState = {
      buf: new Float32Array(sampleRate * 3),
      write: 0
    };
    this.reverbState = {
      comb1: new Float32Array(Math.floor(sampleRate * 0.031)),
      comb2: new Float32Array(Math.floor(sampleRate * 0.047)),
      idx1: 0,
      idx2: 0
    };
    this.compressorEnv = 0;
    this.initializeMacroValues();
  }

  nextNoiseSample() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    const normalized = (this.randomState >>> 8) / ((1 << 24) - 1);
    return normalized * 2 - 1;
  }

  resetNoiseSequenceForNote() {
    this.randomState = (this.baseRandomSeed + Math.imul(this.noteTriggerCount, 0x9e3779b9)) >>> 0;
    this.noteTriggerCount = (this.noteTriggerCount + 1) >>> 0;
  }

  initializeMacroValues() {
    for (const macro of this.patch.ui?.macros || []) {
      const normalized =
        this.track?.macroValues && typeof this.track.macroValues[macro.id] === "number"
          ? this.track.macroValues[macro.id]
          : typeof macro.defaultNormalized === "number"
            ? macro.defaultNormalized
            : 0.5;
      this.applyMacro(macro.id, normalized);
    }
  }

  // Planning step for the JS renderer.
  //
  // This does not render any audio yet. Instead it lowers the user-facing patch
  // graph into the runtime layout that block processing will use repeatedly:
  // - every host signal and node output gets a stable numeric signal index
  // - every node input is resolved to one of those indices ahead of time
  // - node execution order is fixed topologically so the render loop can just
  //   walk an array instead of traversing the patch graph at runtime
  // - macro-expanded parameter values and param target maps are materialized up
  //   front so DSP code mostly performs typed-array reads/writes
  //
  // In other words, this is the planner for the JS backend. It decides the
  // addressing and execution order that the stream will use later when it fills
  // audio buffers block by block.
  compilePatch(patch) {
    const nodeById = new Map();
    for (const node of patch.nodes) {
      nodeById.set(node.id, node);
    }

    const userNodeIds = patch.nodes.map((node) => node.id);
    const indegree = new Map(userNodeIds.map((id) => [id, 0]));
    const adj = new Map(userNodeIds.map((id) => [id, []]));
    for (const conn of patch.connections) {
      if (!nodeById.has(conn.from.nodeId) || !nodeById.has(conn.to.nodeId)) {
        continue;
      }
      indegree.set(conn.to.nodeId, (indegree.get(conn.to.nodeId) || 0) + 1);
      adj.get(conn.from.nodeId).push(conn.to.nodeId);
    }

    const queue = [];
    for (const [id, degree] of indegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const nodeOrder = [];
    while (queue.length) {
      const current = queue.shift();
      nodeOrder.push(current);
      for (const next of adj.get(current) || []) {
        const nextDegree = (indegree.get(next) || 0) - 1;
        indegree.set(next, nextDegree);
        if (nextDegree === 0) {
          queue.push(next);
        }
      }
    }

    if (nodeOrder.length !== patch.nodes.length) {
      throw new Error(`Patch graph for "${patch.id}" contains a cycle or disconnected dependency chain.`);
    }

    const outputNodeId = patch?.io?.audioOutNodeId;
    if (!outputNodeId || !nodeById.has(outputNodeId)) {
      throw new Error(`Patch "${patch.id}" has invalid io.audioOutNodeId.`);
    }
    const outputPortId = patch?.io?.audioOutPortId || "out";

    const outputIndexByKey = new Map();
    let nextSignalIndex = 0;
    const ensureOutputIndex = (nodeId, portId) => {
      const key = `${nodeId}:${portId}`;
      if (!outputIndexByKey.has(key)) {
        outputIndexByKey.set(key, nextSignalIndex);
        nextSignalIndex += 1;
      }
      return outputIndexByKey.get(key);
    };

    const hostSignalIndices = {
      pitch: ensureOutputIndex("$host.pitch", "out"),
      gate: ensureOutputIndex("$host.gate", "out"),
      velocity: ensureOutputIndex("$host.velocity", "out"),
      modWheel: ensureOutputIndex("$host.modwheel", "out")
    };

    const inputSourceByDestKey = new Map();
    for (const conn of patch.connections) {
      const fromIsHost = Boolean(HOST_NODES[conn.from.nodeId]);
      if (!fromIsHost && !nodeById.has(conn.from.nodeId)) {
        continue;
      }
      if (!nodeById.has(conn.to.nodeId)) {
        continue;
      }
      const sourceSignalIndex = ensureOutputIndex(conn.from.nodeId, conn.from.portId);
      inputSourceByDestKey.set(`${conn.to.nodeId}:${conn.to.portId}`, sourceSignalIndex);
    }

    for (const node of patch.nodes) {
      ensureOutputIndex(node.id, "out");
    }

    const fallbackOutputSignalIndex = ensureOutputIndex(outputNodeId, "out");
    const outputSignalIndex = outputPortId === "out" ? fallbackOutputSignalIndex : -1;
    const outputInputSourceSignalIndex = inputSourceByDestKey.get(`${outputNodeId}:${outputPortId}`) ?? -1;
    const createRuntimeNode = (id, typeId, params, outIndex, inputs, stateIndex) => ({
      id,
      typeId,
      params,
      outIndex,
      inputs,
      stateIndex,
      paramValues: Object.create(null),
      processor: getNodeProcessor(typeId)
    });

    const nodeRuntimes = [
      createRuntimeNode("$host.pitch", "NotePitch", {}, hostSignalIndices.pitch, {}, 0),
      createRuntimeNode("$host.gate", "NoteGate", {}, hostSignalIndices.gate, {}, 1),
      createRuntimeNode("$host.velocity", "NoteVelocity", {}, hostSignalIndices.velocity, {}, 2),
      createRuntimeNode("$host.modwheel", "ModWheel", {}, hostSignalIndices.modWheel, {}, 3)
    ];
    for (const nodeId of nodeOrder) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      const inputIndices = {};
      const portsIn = PORTS_IN_BY_TYPE[node.typeId] || ["in"];
      for (const portId of portsIn) {
        inputIndices[portId] = inputSourceByDestKey.get(`${node.id}:${portId}`) ?? -1;
      }
      nodeRuntimes.push(createRuntimeNode(
        node.id,
        node.typeId,
        node.params || {},
        outputIndexByKey.get(`${node.id}:out`) ?? -1,
        inputIndices,
        nodeRuntimes.length
      ));
    }

    const nodeRuntimeById = new Map(nodeRuntimes.map((runtimeNode) => [runtimeNode.id, runtimeNode]));
    const paramTargets = new Map();
    for (const node of patch.nodes) {
      const nodeParams = new Map();
      const runtimeNode = nodeRuntimeById.get(node.id);
      for (const [paramId, value] of Object.entries(node.params || {})) {
        nodeParams.set(paramId, value);
        if (runtimeNode) {
          runtimeNode.paramValues[paramId] = value;
        }
      }
      paramTargets.set(node.id, nodeParams);
    }

    const macroById = new Map((patch.ui?.macros || []).map((macro) => [macro.id, macro]));

    return {
      nodeById,
      nodeRuntimes,
      nodeRuntimeById,
      paramTargets,
      macroById,
      outputNodeId,
      outputSignalIndex,
      fallbackOutputSignalIndex,
      outputInputSourceSignalIndex,
      hostSignalIndices,
      inputSourceByDestKey,
      outputIndexByKey,
      signalCount: nextSignalIndex
    };
  }

  resolveProbeSignalIndex(target) {
    if (!target || typeof target !== "object") {
      return -1;
    }
    if (target.kind === "connection") {
      const connection = this.patch.connections.find((entry) => entry.id === target.connectionId);
      if (!connection) {
        return -1;
      }
      return this.compiled.outputIndexByKey.get(`${connection.from.nodeId}:${connection.from.portId}`) ?? -1;
    }
    if (target.kind === "port") {
      if (target.portKind === "out") {
        return this.compiled.outputIndexByKey.get(`${target.nodeId}:${target.portId}`) ?? -1;
      }
      return this.compiled.inputSourceByDestKey.get(`${target.nodeId}:${target.portId}`) ?? -1;
    }
    return -1;
  }

  // Track-level voice allocation is still intentionally simple: one note at a time
  // per track, with quietest-voice stealing retained as a safety fallback.
  allocateVoice(sampleTime) {
    const free = this.voices.find((voice) => !voice.active);
    if (free) {
      return free;
    }

    const minAgeSamples = Math.floor(this.sampleRate * 0.02);
    let best = this.voices[0];
    let bestScore = Infinity;

    for (const voice of this.voices) {
      const age = sampleTime - voice.lastTriggeredSampleTime;
      const agePenalty = age < minAgeSamples ? 1000 : 0;
      const score = voice.rms + agePenalty;
      if (score < bestScore) {
        best = voice;
        bestScore = score;
      }
    }

    return best;
  }

  // NoteOn updates host control values for the selected voice and resets its DSP
  // state so envelopes and oscillators restart from a known state.
  restartVoice(voice, event, sampleTime) {
    voice.active = true;
    voice.noteId = event.noteId;
    voice.lastTriggeredSampleTime = sampleTime;
    voice.host.pitchVoct = event.pitchVoct;
    voice.host.velocity = event.velocity;
    voice.host.gate = 1;
    voice.nodeState.fill(null);
    voice.paramState.fill(null);
    this.resetNoiseSequenceForNote();
  }

  noteOn(event, sampleTime) {
    const existing = this.voices.find((voice) => voice.active && voice.noteId === event.noteId);
    if (existing) {
      // Exact-boundary loop retriggers can deliver NoteOff and NoteOn for the same
      // note on the same sample. Treat that as a fresh attack so envelopes and
      // oscillators restart instead of silently reusing the released voice state.
      this.restartVoice(existing, event, sampleTime);
      return;
    }

    let voice = this.voices.find((entry) => entry.active);
    if (!voice) {
      voice = this.allocateVoice(sampleTime);
    } else {
      for (const other of this.voices) {
        if (other !== voice) {
          other.active = false;
          other.noteId = null;
          other.host.gate = 0;
          other.rms = 0;
        }
      }
    }

    this.restartVoice(voice, event, sampleTime);
  }

  // NoteOff only drops the host gate. Release behavior is then driven entirely by
  // patch wiring, usually through an ADSR connected to a VCA or filter modulation.
  noteOff(event) {
    let released = false;
    for (const voice of this.voices) {
      if (voice.active && voice.noteId === event.noteId) {
        voice.host.gate = 0;
        released = true;
      }
    }
    if (released) {
      return;
    }

    for (const voice of this.voices) {
      if (voice.active) {
        voice.host.gate = 0;
        break;
      }
    }
  }

  // ParamChange events and macro bindings both feed this compiled target map.
  setParam(nodeId, paramId, value) {
    const nodeParams = this.compiled.paramTargets.get(nodeId);
    const runtimeNode = this.compiled.nodeRuntimeById.get(nodeId);
    if (!nodeParams || !runtimeNode) {
      return;
    }
    nodeParams.set(paramId, value);
    runtimeNode.paramValues[paramId] = value;
  }

  // Macros stay as UI-facing normalized controls and are expanded here into the
  // concrete node parameter values that the DSP graph consumes.
  applyMacro(macroId, normalized) {
    if (macroId === TRACK_VOLUME_AUTOMATION_ID) {
      this.track.volume = clamp(normalized, 0, 1) * TRACK_VOLUME_RANGE.MAX;
      return;
    }
    const macro = this.compiled.macroById.get(macroId);
    if (!macro) {
      return;
    }

    const n = clamp(normalized, 0, 1);
    for (const binding of macro.bindings) {
      let value;
      if (binding.map === "piecewise" && Array.isArray(binding.points) && binding.points.length >= 2) {
        const points = binding.points;
        if (n <= points[0].x) {
          value = points[0].y;
        } else if (n >= points[points.length - 1].x) {
          value = points[points.length - 1].y;
        } else {
          let segmentIndex = 1;
          while (segmentIndex < points.length && n > points[segmentIndex].x) {
            segmentIndex += 1;
          }
          const left = points[segmentIndex - 1];
          const right = points[segmentIndex];
          const span = Math.max(right.x - left.x, 0.000001);
          const segmentNorm = (n - left.x) / span;
          value = left.y + (right.y - left.y) * segmentNorm;
        }
      } else if (binding.map === "exp") {
        const min = Math.max(binding.min, 0.000001);
        value = min * Math.pow(binding.max / min, n);
      } else {
        value = binding.min + (binding.max - binding.min) * n;
      }
      this.setParam(binding.nodeId, binding.paramId, value);
    }
  }

  // Inputs are resolved at compile time to integer signal indices; runtime reads are
  // just buffer lookups, not string-based graph traversal.
  getInputBuffer(signalBuffers, inputIndex) {
    return inputIndex >= 0 ? signalBuffers[inputIndex] : null;
  }

  getInputBufferOr(signalBuffers, inputIndex, fallbackBuffer) {
    return this.getInputBuffer(signalBuffers, inputIndex) || fallbackBuffer || this.zeroBuffer;
  }

  getParamValue(runtimeNode, paramId, fallback) {
    return runtimeNode.paramValues[paramId] ?? fallback;
  }

  getNodeState(voice, runtimeNode, createState) {
    const stateIndex = runtimeNode.stateIndex;
    let state = voice.nodeState[stateIndex];
    if (!state && createState) {
      state = createState();
      voice.nodeState[stateIndex] = state;
    }
    return state;
  }

  getParamBuffer(voice, runtimeNode, paramId) {
    const stateIndex = runtimeNode.stateIndex;
    let nodeParamBuffers = voice.paramBuffers[stateIndex];
    if (!nodeParamBuffers) {
      nodeParamBuffers = Object.create(null);
      voice.paramBuffers[stateIndex] = nodeParamBuffers;
    }
    let buffer = nodeParamBuffers[paramId];
    if (!buffer) {
      buffer = new Float32Array(this.blockSize);
      nodeParamBuffers[paramId] = buffer;
    }
    return buffer;
  }

  // Numeric params are smoothed into per-voice block buffers before node DSP runs.
  // Nodes then read paramBuffer[i] alongside other audio/CV buffers for the frame range.
  fillNumericParamBuffer(voice, runtimeNode, paramId, fallback, startFrame, endFrame) {
    const targetRaw = this.getParamValue(runtimeNode, paramId, fallback);
    const target = typeof targetRaw === "number" ? targetRaw : Number(fallback);
    const smoothingMs =
      PARAM_SMOOTHING_MS[runtimeNode.typeId] && PARAM_SMOOTHING_MS[runtimeNode.typeId][paramId]
        ? PARAM_SMOOTHING_MS[runtimeNode.typeId][paramId]
        : 0;
    const buffer = this.getParamBuffer(voice, runtimeNode, paramId);

    let nodeParamState = voice.paramState[runtimeNode.stateIndex];
    if (!nodeParamState) {
      nodeParamState = Object.create(null);
      voice.paramState[runtimeNode.stateIndex] = nodeParamState;
    }

    const prev = nodeParamState[paramId];
    const current = prev === undefined ? target : prev;
    if (prev === undefined || smoothingMs <= 0) {
      nodeParamState[paramId] = target;
      buffer.fill(target, startFrame, endFrame);
      return buffer;
    }

    let smoothed = current;
    const alpha = smoothingAlpha(smoothingMs, this.sampleRate);
    for (let i = startFrame; i < endFrame; i += 1) {
      smoothed = onePoleStep(smoothed, target, alpha);
      buffer[i] = smoothed;
    }
    nodeParamState[paramId] = smoothed;
    return buffer;
  }

  // Render one runtime node across a contiguous frame range. Every port read is just
  // a typed-array access into the preallocated signal buffer set for this voice.
  processNodeFrames(voice, runtimeNode, signalBuffers, startFrame, endFrame) {
    const { outIndex, inputs, processor } = runtimeNode;
    const out = signalBuffers[outIndex];
    const hostSignalIndices = this.compiled.hostSignalIndices;
    const read = (portId, fallbackBuffer) => this.getInputBufferOr(signalBuffers, inputs[portId] ?? -1, fallbackBuffer);
    const context = this.nodeRenderContext;
    context.voice = voice;
    context.runtimeNode = runtimeNode;
    context.signalBuffers = signalBuffers;
    context.startFrame = startFrame;
    context.endFrame = endFrame;
    context.out = out;
    context.read = read;
    context.hostPitchBuffer = signalBuffers[hostSignalIndices.pitch];
    context.hostGateBuffer = signalBuffers[hostSignalIndices.gate];
    processor(context);
  }

  // Render a single voice for the requested frame range by running the compiled node
  // list in order, then validating and returning the designated output buffer.
  renderVoiceFrames(voice, startFrame, endFrame) {
    const signalBuffers = voice.signalBuffers;
    for (const nodeRuntime of this.compiled.nodeRuntimes) {
      this.processNodeFrames(voice, nodeRuntime, signalBuffers, startFrame, endFrame);
    }

    let outputBuffer = null;
    if (this.compiled.outputSignalIndex >= 0) {
      outputBuffer = signalBuffers[this.compiled.outputSignalIndex];
    } else if (this.compiled.fallbackOutputSignalIndex >= 0) {
      outputBuffer = signalBuffers[this.compiled.fallbackOutputSignalIndex];
    } else if (this.compiled.outputInputSourceSignalIndex >= 0) {
      outputBuffer = signalBuffers[this.compiled.outputInputSourceSignalIndex];
    }

    if (!outputBuffer) {
      return null;
    }

    let allFinite = true;
    for (let i = startFrame; i < endFrame; i += 1) {
      const sample = outputBuffer[i];
      if (!Number.isFinite(sample)) {
        allFinite = false;
        break;
      }
      voice.rms = voice.rms * 0.995 + Math.abs(sample) * 0.005;
    }

    if (!allFinite) {
      voice.active = false;
      voice.noteId = null;
      voice.host.gate = 0;
      voice.rms = 0;
      voice.nodeState.fill(null);
      voice.paramState.fill(null);
      outputBuffer.fill(0, startFrame, endFrame);
      return null;
    }

    if (voice.host.gate < 0.5 && voice.rms < 0.0005) {
      voice.active = false;
      voice.noteId = null;
    }

    return outputBuffer;
  }

  // Track FX are post-voice, pre-master shared effects. They operate in-place on the
  // mixed track buffer for the current frame slice.
  applyTrackFxRange(buffer, startFrame, endFrame) {
    const fx = this.track.fx || {};

    for (let i = startFrame; i < endFrame; i += 1) {
      let out = buffer[i];

      if (fx.delayEnabled) {
        const timeSamples = clamp(Math.floor(this.sampleRate * 0.24), 1, this.delayState.buf.length - 1);
        const readIdx = (this.delayState.write - timeSamples + this.delayState.buf.length) % this.delayState.buf.length;
        const delayed = this.delayState.buf[readIdx];
        this.delayState.buf[this.delayState.write] = out + delayed * 0.35;
        this.delayState.write = (this.delayState.write + 1) % this.delayState.buf.length;
        const mix = clamp(fx.delayMix || 0.2, 0, 1);
        out = out * (1 - mix) + delayed * mix;
      }

      if (fx.reverbEnabled) {
        const c1 = this.reverbState.comb1[this.reverbState.idx1];
        const c2 = this.reverbState.comb2[this.reverbState.idx2];
        this.reverbState.comb1[this.reverbState.idx1] = out + c1 * 0.45;
        this.reverbState.comb2[this.reverbState.idx2] = out + c2 * 0.35;
        this.reverbState.idx1 = (this.reverbState.idx1 + 1) % this.reverbState.comb1.length;
        this.reverbState.idx2 = (this.reverbState.idx2 + 1) % this.reverbState.comb2.length;
        const wet = (c1 + c2) * 0.5;
        const mix = clamp(fx.reverbMix || 0.2, 0, 1);
        out = out * (1 - mix) + wet * mix;
      }

      if (fx.saturationEnabled) {
        const drive = 1 + (fx.drive || 0.2) * 5;
        out = Math.tanh(out * drive);
      }

      if (fx.compressorEnabled) {
        const c = clamp(fx.compression || 0.4, 0, 1);
        const absIn = Math.abs(out);
        this.compressorEnv = this.compressorEnv * 0.995 + absIn * 0.005;
        const over = Math.max(this.compressorEnv - 0.2, 0);
        const gain = 1 / (1 + over * c * 6);
        out = out * gain;
      }

      buffer[i] = Number.isFinite(out) ? out : 0;
    }
  }

  // Mix all active voices for this track into a temporary track buffer, apply track
  // FX once, then accumulate into the master buffer. Normal transport respects track
  // mute, but instrument preview bypasses mute so auditioning still works.
  processTrackFrames(targetBuffer, startFrame, endFrame, options = {}) {
    const ignoreMute = Boolean(options.ignoreMute);
    const ignoreVolume = Boolean(options.ignoreVolume);
    this.trackBuffer.fill(0, startFrame, endFrame);

    for (const voice of this.voices) {
      if (!voice.active) continue;
      const voiceOutput = this.renderVoiceFrames(voice, startFrame, endFrame);
      if (!voiceOutput) continue;
      if (options.captureBufferByProbeId) {
        const captureOffset = Number.isFinite(options.captureOffset) ? options.captureOffset : 0;
        for (const [probeId, signalIndex] of options.captureBufferByProbeId.entries()) {
          const signalBuffer = voice.signalBuffers[signalIndex];
          const captureBuffer = options.captureSamplesByProbeId.get(probeId);
          if (!signalBuffer || !captureBuffer) {
            continue;
          }
          for (let i = startFrame; i < endFrame; i += 1) {
            captureBuffer[captureOffset + (i - startFrame)] += signalBuffer[i];
          }
        }
      }
      for (let i = startFrame; i < endFrame; i += 1) {
        this.trackBuffer[i] += voiceOutput[i];
      }
    }

    this.applyTrackFxRange(this.trackBuffer, startFrame, endFrame);
    if (this.track.mute && !ignoreMute) {
      return;
    }

    const trackVolume = ignoreVolume
      ? TRACK_VOLUME_RANGE.DEFAULT
      : clamp(Number(this.track.volume ?? TRACK_VOLUME_RANGE.DEFAULT), TRACK_VOLUME_RANGE.MIN, TRACK_VOLUME_RANGE.MAX);
    if (trackVolume <= TRACK_VOLUME_RANGE.MIN) {
      return;
    }

    for (let i = startFrame; i < endFrame; i += 1) {
      targetBuffer[i] += this.trackBuffer[i] * trackVolume;
    }
  }
}

const buildTrackRuntimes = (project, sampleRate, blockSize, randomSeed = DEFAULT_RANDOM_SEED) => {
  const trackRuntimes = [];
  const trackRuntimeById = new Map();
  const trackRuntimesByPatchId = new Map();
  for (const [trackIndex, track] of (project?.tracks || []).entries()) {
    const patch = (project.patches || []).find((entry) => entry.id === track.instrumentPatchId);
    if (!patch) {
      continue;
    }
    try {
      const runtime = new TrackRuntime(track, patch, sampleRate, blockSize, ((Number(randomSeed) >>> 0) + trackIndex) >>> 0);
      trackRuntimes.push(runtime);
      trackRuntimeById.set(track.id, runtime);
      const runtimesForPatch = trackRuntimesByPatchId.get(patch.id);
      if (runtimesForPatch) {
        runtimesForPatch.push(runtime);
      } else {
        trackRuntimesByPatchId.set(patch.id, [runtime]);
      }
    } catch {
      // Invalid patch graphs are rejected and skipped for runtime safety.
    }
  }
  return { trackRuntimes, trackRuntimeById, trackRuntimesByPatchId };
};

export class JsSynthRenderStream {
  constructor(renderer, options) {
    this.renderer = renderer;
    this.port = renderer.port;
    this.sampleRateInternal = renderer.sampleRateInternal;
    this.blockSize = renderer.blockSize;
    this.project = options.project;
    this.mode = options.mode || "transport";
    this.trackRuntimes = [];
    this.trackRuntimeById = new Map();
    this.trackRuntimesByPatchId = new Map();
    this.eventQueue = [];
    this.previewIgnoreVolume = options.ignoreVolume !== false;
    this.previewRemainingSamples = this.mode === "preview" ? Math.max(0, options.durationSamples || 0) : 0;
    this.previewCapture = null;
    this.sampleCounter = 0;
    this.songSampleCounter = Math.max(0, options.songStartSample || 0);
    this.transportSessionId = Number.isFinite(options.sessionId) ? options.sessionId : 1;
    this.recordingTrackId = null;
    this.masterCompressorEnv = 0;
    this.masterBuffer = new Float32Array(this.blockSize);
    this.stopped = false;

    const randomSeed = Number.isFinite(options.randomSeed) ? Number(options.randomSeed) >>> 0 : DEFAULT_RANDOM_SEED;
    const runtimeGraph = buildTrackRuntimes(this.project, this.sampleRateInternal, this.blockSize, randomSeed);
    this.trackRuntimes = runtimeGraph.trackRuntimes;
    this.trackRuntimeById = runtimeGraph.trackRuntimeById;
    this.trackRuntimesByPatchId = runtimeGraph.trackRuntimesByPatchId;

    if (Array.isArray(options.events)) {
      this.enqueueEvents(options.events);
    }
    this.resetAllTrackVoices();
    if (this.mode === "preview") {
      this.beginPreviewCapture(options);
    }
  }

  get playing() {
    return !this.stopped && this.mode === "transport";
  }

  get previewing() {
    return !this.stopped && this.mode === "preview" && this.previewRemainingSamples > 0;
  }

  beginPreviewCapture(options) {
    const captureProbes = Array.isArray(options.captureProbes) ? options.captureProbes : [];
    if (!captureProbes.length) {
      this.previewCapture = null;
      return;
    }
    const trackRuntime = this.trackRuntimeById.get(options.trackId);
    if (!trackRuntime) {
      this.previewCapture = null;
      return;
    }
    const durationSamples = Math.max(0, Math.floor(options.durationSamples || 0));
    const signalIndexByProbeId = new Map();
    const captureSamplesByProbeId = new Map();
    const captureMetaByProbeId = new Map();
    for (const probe of captureProbes) {
      const signalIndex = trackRuntime.resolveProbeSignalIndex(probe.target);
      if (signalIndex < 0) {
        continue;
      }
      signalIndexByProbeId.set(probe.probeId, signalIndex);
      captureSamplesByProbeId.set(probe.probeId, new Float32Array(durationSamples));
      captureMetaByProbeId.set(probe.probeId, probe);
    }
    this.previewCapture = signalIndexByProbeId.size > 0
      ? {
          previewId: options.previewId,
          trackId: options.trackId,
          durationSamples,
          lastEmittedCapturedSamples: 0,
          signalIndexByProbeId,
          captureSamplesByProbeId,
          captureMetaByProbeId
        }
      : null;
  }

  emitPreviewCapture(force = false) {
    if (!this.previewCapture) {
      return;
    }
    const capturedSamples = Math.max(0, this.previewCapture.durationSamples - this.previewRemainingSamples);
    if (!force && capturedSamples - this.previewCapture.lastEmittedCapturedSamples < 1024) {
      return;
    }
    this.previewCapture.lastEmittedCapturedSamples = capturedSamples;
    const captures = [];
    for (const [probeId, samples] of this.previewCapture.captureSamplesByProbeId.entries()) {
      const meta = this.previewCapture.captureMetaByProbeId.get(probeId);
      if (!meta) {
        continue;
      }
      captures.push({
        probeId,
        kind: meta.kind,
        target: meta.target,
        sampleRate: this.sampleRateInternal,
        durationSamples: this.previewCapture.durationSamples,
        capturedSamples,
        samples: Array.from(samples.slice(0, capturedSamples))
      });
    }
    this.port.postMessage({
      type: "PREVIEW_CAPTURE",
      previewId: this.previewCapture.previewId,
      captures
    });
    if (force) {
      this.previewCapture = null;
    }
  }

  resetTrackVoices(trackRuntime, options = {}) {
    const clearNoteId = Boolean(options.clearNoteId);
    for (const voice of trackRuntime.voices) {
      voice.active = false;
      if (clearNoteId) {
        voice.noteId = null;
      }
      voice.host.gate = 0;
      voice.rms = 0;
    }
  }

  resetAllTrackVoices(options = {}) {
    for (const track of this.trackRuntimes) {
      this.resetTrackVoices(track, options);
    }
  }

  enqueueEvents(events) {
    for (const evt of events) {
      if (!evt || !Number.isFinite(evt.sampleTime)) {
        continue;
      }
      this.eventQueue.push(evt);
    }
    this.eventQueue.sort(compareScheduledEvents);
  }

  setRecordingTrack(trackId) {
    this.recordingTrackId = typeof trackId === "string" ? trackId : null;
    if (this.recordingTrackId) {
      const track = this.trackRuntimeById.get(this.recordingTrackId);
      if (track) {
        this.resetTrackVoices(track, { clearNoteId: true });
      }
    }
  }

  setMacroValue(trackId, macroId, normalized) {
    const trackRuntime = this.trackRuntimeById.get(trackId);
    if (trackRuntime) {
      trackRuntime.applyMacro(macroId, normalized);
    }
  }

  handleEvent(event) {
    if (!this.project || !event || typeof event.type !== "string") {
      return;
    }

    if (event.type === "ParamChange") {
      const patchRuntimes = this.trackRuntimesByPatchId.get(event.patchId);
      if (!patchRuntimes) {
        return;
      }
      for (const track of patchRuntimes) {
        track.setParam(event.nodeId, event.paramId, event.value);
      }
      return;
    }

    if (event.type === "MacroChange") {
      const trackRuntime = this.trackRuntimeById.get(event.trackId);
      if (trackRuntime) {
        trackRuntime.applyMacro(event.macroId, event.normalized);
      }
      return;
    }

    const track = this.trackRuntimeById.get(event.trackId);
    if (!track) {
      return;
    }

    if (this.recordingTrackId && event.trackId === this.recordingTrackId && event.source === "timeline") {
      return;
    }

    if (event.type === "NoteOn") {
      track.noteOn(event, this.songSampleCounter);
    } else if (event.type === "NoteOff") {
      track.noteOff(event);
    }
  }

  applyMasterFxRange(buffer, startFrame, endFrame) {
    if (!this.project) {
      return;
    }

    for (let i = startFrame; i < endFrame; i += 1) {
      let out = buffer[i];
      if (this.project.masterFx?.compressorEnabled) {
        const absIn = Math.abs(out);
        this.masterCompressorEnv = this.masterCompressorEnv * 0.996 + absIn * 0.004;
        const over = Math.max(this.masterCompressorEnv - 0.25, 0);
        const gain = 1 / (1 + over * 5);
        out *= gain;
      }

      out *= dbToGain(this.project.masterFx?.makeupGain || 0);
      if (this.project.masterFx?.limiterEnabled !== false) {
        out = clamp(out, -0.98, 0.98);
      }
      buffer[i] = Number.isFinite(out) ? out : 0;
    }
  }

  consumeDueEvents() {
    const currentSongSample = this.songSampleCounter;
    while (this.eventQueue.length > 0) {
      const next = this.eventQueue[0];
      if (!next || !Number.isFinite(next.sampleTime)) {
        this.eventQueue.shift();
        continue;
      }
      if (next.sampleTime > currentSongSample) {
        break;
      }
      this.handleEvent(this.eventQueue.shift());
    }
  }

  nextPendingEventSample() {
    while (this.eventQueue.length > 0) {
      const next = this.eventQueue[0];
      if (!next || !Number.isFinite(next.sampleTime)) {
        this.eventQueue.shift();
        continue;
      }
      return next.sampleTime;
    }
    return Infinity;
  }

  renderFrameRange(left, right, startFrame, endFrame) {
    this.masterBuffer.fill(0, startFrame, endFrame);
    const captureOffset = this.songSampleCounter;
    let previewCompleted = false;

    if (this.playing || this.previewing) {
      for (const track of this.trackRuntimes) {
        track.processTrackFrames(this.masterBuffer, startFrame, endFrame, {
          ignoreMute: this.previewing,
          ignoreVolume: this.previewing ? this.previewIgnoreVolume : false,
          captureOffset,
          captureBufferByProbeId:
            this.previewCapture && track.track.id === this.previewCapture.trackId
              ? this.previewCapture.signalIndexByProbeId
              : null,
          captureSamplesByProbeId:
            this.previewCapture && track.track.id === this.previewCapture.trackId
              ? this.previewCapture.captureSamplesByProbeId
              : null
        });
      }
    }

    this.applyMasterFxRange(this.masterBuffer, startFrame, endFrame);

    for (let i = startFrame; i < endFrame; i += 1) {
      const sample = this.masterBuffer[i];
      left[i] = sample;
      right[i] = sample;
      if (this.playing || this.previewing) {
        this.songSampleCounter += 1;
      }
      if (this.previewing) {
        this.previewRemainingSamples -= 1;
        if (this.previewRemainingSamples <= 0) {
          this.eventQueue.length = 0;
          this.resetAllTrackVoices();
          previewCompleted = true;
        }
      }
      this.sampleCounter += 1;
    }

    if (previewCompleted) {
      this.stop();
      this.emitPreviewCapture(true);
    } else if (this.previewCapture) {
      this.emitPreviewCapture(false);
    }
  }

  processBlock(output) {
    const left = output[0];
    const right = output[1] || output[0];

    if (this.stopped) {
      left.fill(0);
      if (right !== left) {
        right.fill(0);
      }
      return true;
    }

    let frame = 0;
    while (frame < left.length) {
      this.consumeDueEvents();

      let segmentEnd = left.length;
      if (this.playing || this.previewing) {
        const nextEventSample = this.nextPendingEventSample();
        if (Number.isFinite(nextEventSample) && nextEventSample > this.songSampleCounter) {
          const framesUntilEvent = Math.max(1, Math.floor(nextEventSample - this.songSampleCounter));
          segmentEnd = Math.min(left.length, frame + framesUntilEvent);
        }
      }

      if (segmentEnd <= frame) {
        segmentEnd = frame + 1;
      }

      this.renderFrameRange(left, right, frame, segmentEnd);
      frame = segmentEnd;
    }

    return true;
  }

  stop() {
    this.stopped = true;
    this.eventQueue.length = 0;
    this.previewRemainingSamples = 0;
    this.resetAllTrackVoices();
  }
}

export class JsSynthRenderer {
  constructor(options = {}) {
    this.port = {
      onmessage: null,
      postMessage() {}
    };
    this.sampleRateInternal = DEFAULT_SAMPLE_RATE;
    this.blockSize = 128;
    this.defaultProject = null;

    const processorOptions = options && options.processorOptions ? options.processorOptions : null;
    if (processorOptions) {
      this.configure(processorOptions);
      if (processorOptions.project) {
        this.defaultProject = processorOptions.project;
      }
    }
  }

  configure(config) {
    this.sampleRateInternal = config.sampleRate || DEFAULT_SAMPLE_RATE;
    this.blockSize = config.blockSize || 128;
  }

  setDefaultProject(project) {
    this.defaultProject = project;
  }

  startStream(options) {
    const project = options.project || this.defaultProject;
    if (!project) {
      return null;
    }
    return new JsSynthRenderStream(this, { ...options, project });
  }

  get project() {
    return this.defaultProject;
  }
}


export { compareScheduledEvents };
export const createJsRenderer = (config = {}) => new JsSynthRenderer(config);
