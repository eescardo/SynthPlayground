const MAX_VOICES = 8;
const DEFAULT_SAMPLE_RATE = 48000;

const HOST_NODES = {
  "$host.pitch": { typeId: "NotePitch" },
  "$host.gate": { typeId: "NoteGate" },
  "$host.velocity": { typeId: "NoteVelocity" },
  "$host.modwheel": { typeId: "ModWheel" }
};

const PARAM_SMOOTHING_MS = {
  VCO: { pulseWidth: 20, baseTuneCents: 10, fineTuneCents: 10, pwmAmount: 20 },
  LFO: { freqHz: 50, pulseWidth: 20 },
  ADSR: { attack: 10, decay: 10, sustain: 10, release: 10 },
  VCA: { bias: 10, gain: 10 },
  VCF: { cutoffHz: 20, resonance: 10, cutoffModAmountOct: 10 },
  Mixer4: { gain1: 10, gain2: 10, gain3: 10, gain4: 10 },
  SamplePlayer: { gain: 10, pitchSemis: 10 },
  Noise: { gain: 10 },
  Delay: { timeMs: 30, feedback: 30, mix: 10 },
  Reverb: { size: 50, decay: 50, damping: 50, mix: 10 },
  Saturation: { driveDb: 20, mix: 10 },
  Overdrive: { gainDb: 20, tone: 20, mix: 10 },
  Compressor: { thresholdDb: 50, ratio: 50, attackMs: 50, releaseMs: 50, makeupDb: 50, mix: 10 },
  Output: { gainDb: 30 }
};

const PORTS_IN_BY_TYPE = {
  NotePitch: [],
  NoteGate: [],
  NoteVelocity: [],
  ModWheel: [],
  VCO: ["pitch", "fm", "pwm"],
  LFO: ["fm"],
  ADSR: ["gate"],
  VCA: ["in", "gainCV"],
  VCF: ["in", "cutoffCV"],
  Mixer4: ["in1", "in2", "in3", "in4"],
  SamplePlayer: ["gate", "pitch"],
  Noise: [],
  Delay: ["in"],
  Reverb: ["in"],
  Saturation: ["in"],
  Overdrive: ["in"],
  Compressor: ["in"],
  Output: ["in"]
};

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const dbToGain = (db) => Math.pow(10, db / 20);
const onePoleStep = (current, target, alpha) => current + (target - current) * (1 - alpha);

const smoothingAlpha = (timeMs, sampleRate) => {
  if (!timeMs || timeMs <= 0) {
    return 0;
  }
  const tauSamples = (timeMs / 1000) * sampleRate;
  return Math.exp(-1 / Math.max(1, tauSamples));
};

const voctToHz = (voct) => 261.625565 * Math.pow(2, voct);

const waveformSample = (wave, phase, pulseWidth = 0.5) => {
  switch (wave) {
    case "sine":
      return Math.sin(phase * Math.PI * 2);
    case "triangle": {
      const t = (phase + 0.25) % 1;
      return 1 - 4 * Math.abs(Math.round(t - 0.25) - (t - 0.25));
    }
    case "saw":
      return 2 * phase - 1;
    case "square":
      return phase < pulseWidth ? 1 : -1;
    default:
      return Math.sin(phase * Math.PI * 2);
  }
};

class VoiceState {
  constructor(signalCount, blockSize) {
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
    this.nodeState = new Map();
    this.paramState = new Map();
    this.paramBuffers = new Map();
    this.signalBuffers = new Array(signalCount).fill(0).map(() => new Float32Array(blockSize));
  }
}

class TrackRuntime {
  constructor(track, patch, sampleRate, blockSize) {
    this.track = track;
    this.patch = patch;
    this.sampleRate = sampleRate;
    this.sampleRateInv = 1 / sampleRate;
    this.blockSize = blockSize;
    this.zeroBuffer = new Float32Array(blockSize);
    this.compiled = this.compilePatch(patch);
    this.voices = new Array(MAX_VOICES).fill(0).map(() => new VoiceState(this.compiled.signalCount, blockSize));
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

  // Compile the user patch into a numeric execution plan:
  // host sources and node outputs get fixed signal indices, inputs resolve to
  // those indices, and runtime nodes are topologically ordered for block rendering.
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

    const nodeRuntimes = [
      {
        id: "$host.pitch",
        typeId: "NotePitch",
        params: {},
        outIndex: hostSignalIndices.pitch,
        inputs: {}
      },
      {
        id: "$host.gate",
        typeId: "NoteGate",
        params: {},
        outIndex: hostSignalIndices.gate,
        inputs: {}
      },
      {
        id: "$host.velocity",
        typeId: "NoteVelocity",
        params: {},
        outIndex: hostSignalIndices.velocity,
        inputs: {}
      },
      {
        id: "$host.modwheel",
        typeId: "ModWheel",
        params: {},
        outIndex: hostSignalIndices.modWheel,
        inputs: {}
      }
    ];
    for (const nodeId of nodeOrder) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      const inputIndices = {};
      const portsIn = PORTS_IN_BY_TYPE[node.typeId] || ["in"];
      for (const portId of portsIn) {
        inputIndices[portId] = inputSourceByDestKey.get(`${node.id}:${portId}`) ?? -1;
      }
      nodeRuntimes.push({
        id: node.id,
        typeId: node.typeId,
        params: node.params || {},
        outIndex: outputIndexByKey.get(`${node.id}:out`) ?? -1,
        inputs: inputIndices
      });
    }

    const paramTargets = new Map();
    for (const node of patch.nodes) {
      const nodeParams = new Map();
      for (const [paramId, value] of Object.entries(node.params || {})) {
        nodeParams.set(paramId, value);
      }
      paramTargets.set(node.id, nodeParams);
    }

    const macroById = new Map((patch.ui?.macros || []).map((macro) => [macro.id, macro]));

    return {
      nodeById,
      nodeRuntimes,
      paramTargets,
      macroById,
      outputNodeId,
      outputSignalIndex,
      fallbackOutputSignalIndex,
      outputInputSourceSignalIndex,
      hostSignalIndices,
      signalCount: nextSignalIndex
    };
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
  noteOn(event, sampleTime) {
    const existing = this.voices.find((voice) => voice.active && voice.noteId === event.noteId);
    if (existing) {
      existing.lastTriggeredSampleTime = sampleTime;
      existing.host.pitchVoct = event.pitchVoct;
      existing.host.velocity = event.velocity;
      existing.host.gate = 1;
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

    voice.active = true;
    voice.noteId = event.noteId;
    voice.lastTriggeredSampleTime = sampleTime;
    voice.host.pitchVoct = event.pitchVoct;
    voice.host.velocity = event.velocity;
    voice.host.gate = 1;
    voice.nodeState.clear();
    voice.paramState.clear();
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
    if (!nodeParams) {
      return;
    }
    nodeParams.set(paramId, value);
  }

  // Macros stay as UI-facing normalized controls and are expanded here into the
  // concrete node parameter values that the DSP graph consumes.
  applyMacro(macroId, normalized) {
    const macro = this.compiled.macroById.get(macroId);
    if (!macro) {
      return;
    }

    const n = clamp(normalized, 0, 1);
    for (const binding of macro.bindings) {
      let value;
      if (binding.map === "exp") {
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

  getParamValue(nodeId, paramId, fallback) {
    const nodeParams = this.compiled.paramTargets.get(nodeId);
    return nodeParams && nodeParams.has(paramId) ? nodeParams.get(paramId) : fallback;
  }

  getParamBuffer(voice, nodeId, paramId) {
    const key = `${nodeId}:${paramId}`;
    let buffer = voice.paramBuffers.get(key);
    if (!buffer) {
      buffer = new Float32Array(this.blockSize);
      voice.paramBuffers.set(key, buffer);
    }
    return buffer;
  }

  // Numeric params are smoothed into per-voice block buffers before node DSP runs.
  // Nodes then read paramBuffer[i] alongside other audio/CV buffers for the frame range.
  fillNumericParamBuffer(voice, nodeId, typeId, paramId, fallback, startFrame, endFrame) {
    const targetRaw = this.getParamValue(nodeId, paramId, fallback);
    const target = typeof targetRaw === "number" ? targetRaw : Number(fallback);
    const smoothingMs = PARAM_SMOOTHING_MS[typeId] && PARAM_SMOOTHING_MS[typeId][paramId] ? PARAM_SMOOTHING_MS[typeId][paramId] : 0;
    const buffer = this.getParamBuffer(voice, nodeId, paramId);

    let nodeParamState = voice.paramState.get(nodeId);
    if (!nodeParamState) {
      nodeParamState = new Map();
      voice.paramState.set(nodeId, nodeParamState);
    }

    const prev = nodeParamState.get(paramId);
    const current = prev === undefined ? target : prev;
    if (prev === undefined || smoothingMs <= 0) {
      nodeParamState.set(paramId, target);
      buffer.fill(target, startFrame, endFrame);
      return buffer;
    }

    let smoothed = current;
    const alpha = smoothingAlpha(smoothingMs, this.sampleRate);
    for (let i = startFrame; i < endFrame; i += 1) {
      smoothed = onePoleStep(smoothed, target, alpha);
      buffer[i] = smoothed;
    }
    nodeParamState.set(paramId, smoothed);
    return buffer;
  }

  // Render one runtime node across a contiguous frame range. Every port read is just
  // a typed-array access into the preallocated signal buffer set for this voice.
  processNodeFrames(voice, runtimeNode, signalBuffers, startFrame, endFrame) {
    const { id, typeId, params, outIndex, inputs } = runtimeNode;
    const out = signalBuffers[outIndex];
    const hostSignalIndices = this.compiled.hostSignalIndices;
    const read = (portId, fallbackBuffer) => this.getInputBufferOr(signalBuffers, inputs[portId] ?? -1, fallbackBuffer);
    const hostPitchBuffer = signalBuffers[hostSignalIndices.pitch];
    const hostGateBuffer = signalBuffers[hostSignalIndices.gate];

    switch (typeId) {
      case "NotePitch":
        out.fill(voice.host.pitchVoct, startFrame, endFrame);
        return;

      case "NoteGate":
        out.fill(voice.host.gate, startFrame, endFrame);
        return;

      case "NoteVelocity":
        out.fill(voice.host.velocity, startFrame, endFrame);
        return;

      case "ModWheel":
        out.fill(voice.host.modWheel, startFrame, endFrame);
        return;

      case "VCO": {
        const phaseState = voice.nodeState.get(id) || { phase: 0 };
        const pitch = read("pitch", hostPitchBuffer);
        const fm = read("fm");
        const pwm = read("pwm");
        const wave = this.getParamValue(id, "wave", params.wave);
        const pulseWidthParam = this.fillNumericParamBuffer(voice, id, typeId, "pulseWidth", Number(params.pulseWidth ?? 0.5), startFrame, endFrame);
        const pwmAmountParam = this.fillNumericParamBuffer(voice, id, typeId, "pwmAmount", Number(params.pwmAmount ?? 0), startFrame, endFrame);
        const baseTuneParam = this.fillNumericParamBuffer(voice, id, typeId, "baseTuneCents", Number(params.baseTuneCents ?? 0), startFrame, endFrame);
        const fineTuneParam = this.fillNumericParamBuffer(voice, id, typeId, "fineTuneCents", Number(params.fineTuneCents ?? 0), startFrame, endFrame);

        for (let i = startFrame; i < endFrame; i += 1) {
          const pulseWidth = clamp(pulseWidthParam[i] + pwmAmountParam[i] * pwm[i], 0.05, 0.95);
          const tuneVoct = (baseTuneParam[i] + fineTuneParam[i]) / 1200;
          const hz = voctToHz(pitch[i] + fm[i] + tuneVoct);
          phaseState.phase = (phaseState.phase + hz * this.sampleRateInv) % 1;
          out[i] = waveformSample(wave, phaseState.phase, pulseWidth);
        }
        voice.nodeState.set(id, phaseState);
        return;
      }

      case "LFO": {
        const state = voice.nodeState.get(id) || { phase: 0 };
        const fm = read("fm");
        const freqParam = this.fillNumericParamBuffer(voice, id, typeId, "freqHz", Number(params.freqHz ?? 1), startFrame, endFrame);
        const pulseWidthParam = this.fillNumericParamBuffer(voice, id, typeId, "pulseWidth", Number(params.pulseWidth ?? 0.5), startFrame, endFrame);
        const wave = this.getParamValue(id, "wave", params.wave);
        const bipolar = Boolean(this.getParamValue(id, "bipolar", Boolean(params.bipolar ?? true)));

        for (let i = startFrame; i < endFrame; i += 1) {
          const freq = clamp(freqParam[i] * Math.pow(2, fm[i]), 0.01, 40);
          const pulseWidth = pulseWidthParam[i];
          state.phase = (state.phase + freq * this.sampleRateInv) % 1;
          let sample = waveformSample(wave, state.phase, pulseWidth);
          if (!bipolar) {
            sample = sample * 0.5 + 0.5;
          }
          out[i] = sample;
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "ADSR": {
        const gate = read("gate", hostGateBuffer);
        const attackParam = this.fillNumericParamBuffer(voice, id, typeId, "attack", Number(params.attack ?? 0.01), startFrame, endFrame);
        const decayParam = this.fillNumericParamBuffer(voice, id, typeId, "decay", Number(params.decay ?? 0.2), startFrame, endFrame);
        const sustainParam = this.fillNumericParamBuffer(voice, id, typeId, "sustain", Number(params.sustain ?? 0.7), startFrame, endFrame);
        const releaseParam = this.fillNumericParamBuffer(voice, id, typeId, "release", Number(params.release ?? 0.2), startFrame, endFrame);
        const mode = this.getParamValue(id, "mode", params.mode || "retrigger_from_current");
        const state = voice.nodeState.get(id) || { stage: "idle", level: 0, lastGate: 0 };

        for (let i = startFrame; i < endFrame; i += 1) {
          const gateValue = gate[i];
          const attack = Math.max(0.0001, attackParam[i]);
          const decay = Math.max(0.0001, decayParam[i]);
          const sustain = clamp(sustainParam[i], 0, 1);
          const release = Math.max(0.0001, releaseParam[i]);

          if (gateValue >= 0.5 && state.lastGate < 0.5) {
            if (mode === "retrigger_from_zero") {
              state.level = 0;
            }
            state.stage = "attack";
          } else if (gateValue < 0.5 && state.lastGate >= 0.5) {
            state.stage = "release";
          }

          if (state.stage === "attack") {
            state.level += 1 / (attack * this.sampleRate);
            if (state.level >= 1) {
              state.level = 1;
              state.stage = "decay";
            }
          } else if (state.stage === "decay") {
            state.level -= (1 - sustain) / (decay * this.sampleRate);
            if (state.level <= sustain) {
              state.level = sustain;
              state.stage = "sustain";
            }
          } else if (state.stage === "sustain") {
            state.level = sustain;
          } else if (state.stage === "release") {
            state.level -= Math.max(state.level, 0.001) / (release * this.sampleRate);
            if (state.level <= 0.0001) {
              state.level = 0;
              state.stage = "idle";
            }
          }

          state.lastGate = gateValue;
          out[i] = clamp(state.level, 0, 1);
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "VCA": {
        const input = read("in");
        const gainCv = read("gainCV");
        const biasParam = this.fillNumericParamBuffer(voice, id, typeId, "bias", Number(params.bias ?? 0), startFrame, endFrame);
        const gainParam = this.fillNumericParamBuffer(voice, id, typeId, "gain", Number(params.gain ?? 1), startFrame, endFrame);

        for (let i = startFrame; i < endFrame; i += 1) {
          const gainCvValue = gainCv[i];
          const gainCvNorm = gainCvValue >= 0 && gainCvValue <= 1 ? gainCvValue : gainCvValue * 0.5 + 0.5;
          const gainEff = clamp(biasParam[i] + gainParam[i] * gainCvNorm, 0, 1);
          out[i] = input[i] * gainEff;
        }
        return;
      }

      case "VCF": {
        const input = read("in");
        const cutoffCv = read("cutoffCV");
        const cutoffHzParam = this.fillNumericParamBuffer(voice, id, typeId, "cutoffHz", Number(params.cutoffHz ?? 1000), startFrame, endFrame);
        const resonanceParam = this.fillNumericParamBuffer(voice, id, typeId, "resonance", Number(params.resonance ?? 0.1), startFrame, endFrame);
        const cutoffModParam = this.fillNumericParamBuffer(voice, id, typeId, "cutoffModAmountOct", Number(params.cutoffModAmountOct ?? 1), startFrame, endFrame);
        const type = this.getParamValue(id, "type", params.type || "lowpass");
        const state = voice.nodeState.get(id) || { lp: 0, bp: 0 };

        for (let i = startFrame; i < endFrame; i += 1) {
          const cutoffEffective = clamp(
            cutoffHzParam[i] * Math.pow(2, cutoffCv[i] * cutoffModParam[i]),
            20,
            20000
          );
          const resonance = clamp(resonanceParam[i], 0, 1);
          const f = clamp((2 * Math.PI * cutoffEffective) / this.sampleRate, 0.001, 0.99);
          const hp = input[i] - state.lp - resonance * state.bp;
          state.bp += f * hp;
          state.lp += f * state.bp;

          let sample = state.lp;
          if (type === "highpass") {
            sample = hp;
          } else if (type === "bandpass") {
            sample = state.bp;
          }
          out[i] = sample;
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "Mixer4": {
        const in1 = read("in1");
        const in2 = read("in2");
        const in3 = read("in3");
        const in4 = read("in4");
        const gain1Param = this.fillNumericParamBuffer(voice, id, typeId, "gain1", Number(params.gain1 ?? 1), startFrame, endFrame);
        const gain2Param = this.fillNumericParamBuffer(voice, id, typeId, "gain2", Number(params.gain2 ?? 1), startFrame, endFrame);
        const gain3Param = this.fillNumericParamBuffer(voice, id, typeId, "gain3", Number(params.gain3 ?? 1), startFrame, endFrame);
        const gain4Param = this.fillNumericParamBuffer(voice, id, typeId, "gain4", Number(params.gain4 ?? 1), startFrame, endFrame);

        for (let i = startFrame; i < endFrame; i += 1) {
          out[i] =
            in1[i] * gain1Param[i] +
            in2[i] * gain2Param[i] +
            in3[i] * gain3Param[i] +
            in4[i] * gain4Param[i];
        }
        return;
      }

      case "Noise": {
        const color = this.getParamValue(id, "color", params.color || "white");
        const gainParam = this.fillNumericParamBuffer(voice, id, typeId, "gain", Number(params.gain ?? 0.3), startFrame, endFrame);
        const state = voice.nodeState.get(id) || { pink: 0, brown: 0 };

        for (let i = startFrame; i < endFrame; i += 1) {
          const white = Math.random() * 2 - 1;
          let sample = white;
          if (color === "pink") {
            state.pink = 0.98 * state.pink + 0.02 * white;
            sample = state.pink;
          } else if (color === "brown") {
            state.brown = clamp(state.brown + white * 0.02, -1, 1);
            sample = state.brown;
          }
          out[i] = sample * gainParam[i];
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "SamplePlayer":
        out.fill(0, startFrame, endFrame);
        return;

      case "Delay": {
        const state = voice.nodeState.get(id) || { buf: new Float32Array(this.sampleRate * 2), write: 0 };
        const input = read("in");
        const timeMsParam = this.fillNumericParamBuffer(voice, id, typeId, "timeMs", Number(params.timeMs ?? 300), startFrame, endFrame);
        const feedbackParam = this.fillNumericParamBuffer(voice, id, typeId, "feedback", Number(params.feedback ?? 0.3), startFrame, endFrame);
        const mixParam = this.fillNumericParamBuffer(voice, id, typeId, "mix", Number(params.mix ?? 0.2), startFrame, endFrame);

        for (let i = startFrame; i < endFrame; i += 1) {
          const delaySamples = clamp(Math.floor((timeMsParam[i] / 1000) * this.sampleRate), 1, state.buf.length - 1);
          const readIdx = (state.write - delaySamples + state.buf.length) % state.buf.length;
          const delayed = state.buf[readIdx];
          const feedback = clamp(feedbackParam[i], 0, 0.95);
          const mix = clamp(mixParam[i], 0, 1);
          const inputSample = input[i];

          state.buf[state.write] = inputSample + delayed * feedback;
          state.write = (state.write + 1) % state.buf.length;
          out[i] = inputSample * (1 - mix) + delayed * mix;
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "Reverb": {
        const input = read("in");
        const state = voice.nodeState.get(id) || {
          c1: new Float32Array(Math.floor(this.sampleRate * 0.029)),
          c2: new Float32Array(Math.floor(this.sampleRate * 0.041)),
          i1: 0,
          i2: 0
        };
        const sizeParam = this.fillNumericParamBuffer(voice, id, typeId, "size", Number(params.size ?? 0.5), startFrame, endFrame);
        const decayParam = this.fillNumericParamBuffer(voice, id, typeId, "decay", Number(params.decay ?? 1.5), startFrame, endFrame);
        const dampingParam = this.fillNumericParamBuffer(voice, id, typeId, "damping", Number(params.damping ?? 0.4), startFrame, endFrame);
        const mixParam = this.fillNumericParamBuffer(voice, id, typeId, "mix", Number(params.mix ?? 0.2), startFrame, endFrame);

        for (let i = startFrame; i < endFrame; i += 1) {
          const size = sizeParam[i];
          const decay = decayParam[i];
          const damping = dampingParam[i];
          const mix = clamp(mixParam[i], 0, 1);
          const fb = clamp(0.2 + size * 0.7, 0, 0.95) * clamp(decay / 10, 0, 1);
          const c1 = state.c1[state.i1];
          const c2 = state.c2[state.i2];
          const inputSample = input[i];

          state.c1[state.i1] = inputSample + (c1 * fb - c1 * damping * 0.05);
          state.c2[state.i2] = inputSample + (c2 * fb - c2 * damping * 0.05);
          state.i1 = (state.i1 + 1) % state.c1.length;
          state.i2 = (state.i2 + 1) % state.c2.length;
          out[i] = inputSample * (1 - mix) + ((c1 + c2) * 0.5) * mix;
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "Saturation": {
        const input = read("in");
        const driveDbParam = this.fillNumericParamBuffer(voice, id, typeId, "driveDb", Number(params.driveDb ?? 6), startFrame, endFrame);
        const mixParam = this.fillNumericParamBuffer(voice, id, typeId, "mix", Number(params.mix ?? 0.5), startFrame, endFrame);
        const mode = this.getParamValue(id, "type", params.type || "tanh");

        for (let i = startFrame; i < endFrame; i += 1) {
          const inputSample = input[i];
          const driven = inputSample * dbToGain(driveDbParam[i]);
          let wet = Math.tanh(driven);
          if (mode === "softclip") {
            wet = clamp(driven, -1.5, 1.5);
            wet = wet - Math.pow(wet, 3) / 3;
          }
          const mix = clamp(mixParam[i], 0, 1);
          out[i] = inputSample * (1 - mix) + wet * mix;
        }
        return;
      }

      case "Overdrive": {
        const input = read("in");
        const gainDbParam = this.fillNumericParamBuffer(voice, id, typeId, "gainDb", Number(params.gainDb ?? 12), startFrame, endFrame);
        const toneParam = this.fillNumericParamBuffer(voice, id, typeId, "tone", Number(params.tone ?? 0.5), startFrame, endFrame);
        const mixParam = this.fillNumericParamBuffer(voice, id, typeId, "mix", Number(params.mix ?? 0.6), startFrame, endFrame);
        const mode = this.getParamValue(id, "mode", params.mode || "overdrive");
        const state = voice.nodeState.get(id) || { toneLp: 0 };

        for (let i = startFrame; i < endFrame; i += 1) {
          const inputSample = input[i];
          let driven = inputSample * dbToGain(gainDbParam[i]);
          if (mode === "fuzz") {
            driven = clamp(driven, -1, 1);
            driven = Math.sign(driven) * Math.pow(Math.abs(driven), 0.5);
          } else {
            driven = Math.tanh(driven);
          }
          const toneAlpha = clamp(0.01 + toneParam[i] * 0.2, 0.01, 0.3);
          state.toneLp = state.toneLp + (driven - state.toneLp) * toneAlpha;
          const mix = clamp(mixParam[i], 0, 1);
          out[i] = inputSample * (1 - mix) + state.toneLp * mix;
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "Compressor": {
        const input = read("in");
        const thresholdDbParam = this.fillNumericParamBuffer(voice, id, typeId, "thresholdDb", Number(params.thresholdDb ?? -24), startFrame, endFrame);
        const ratioParam = this.fillNumericParamBuffer(voice, id, typeId, "ratio", Number(params.ratio ?? 4), startFrame, endFrame);
        const attackMsParam = this.fillNumericParamBuffer(voice, id, typeId, "attackMs", Number(params.attackMs ?? 10), startFrame, endFrame);
        const releaseMsParam = this.fillNumericParamBuffer(voice, id, typeId, "releaseMs", Number(params.releaseMs ?? 200), startFrame, endFrame);
        const makeupDbParam = this.fillNumericParamBuffer(voice, id, typeId, "makeupDb", Number(params.makeupDb ?? 2), startFrame, endFrame);
        const mixParam = this.fillNumericParamBuffer(voice, id, typeId, "mix", Number(params.mix ?? 1), startFrame, endFrame);
        const state = voice.nodeState.get(id) || { env: 0 };

        for (let i = startFrame; i < endFrame; i += 1) {
          const inputSample = input[i];
          const absIn = Math.abs(inputSample);
          const att = smoothingAlpha(Math.max(0.1, attackMsParam[i]), this.sampleRate);
          const rel = smoothingAlpha(Math.max(1, releaseMsParam[i]), this.sampleRate);
          state.env = onePoleStep(state.env, absIn, absIn > state.env ? att : rel);

          const thresholdDb = thresholdDbParam[i];
          const ratio = ratioParam[i];
          const levelDb = 20 * Math.log10(Math.max(state.env, 0.00001));
          const over = Math.max(levelDb - thresholdDb, 0);
          const reducedDb = over - over / Math.max(1, ratio);
          const wet = inputSample * dbToGain(makeupDbParam[i] - reducedDb);
          const mix = clamp(mixParam[i], 0, 1);
          out[i] = inputSample * (1 - mix) + wet * mix;
        }
        voice.nodeState.set(id, state);
        return;
      }

      case "Output": {
        const input = read("in");
        const gainDbParam = this.fillNumericParamBuffer(voice, id, typeId, "gainDb", Number(params.gainDb ?? -6), startFrame, endFrame);
        const limiter = Boolean(this.getParamValue(id, "limiter", params.limiter ?? true));

        for (let i = startFrame; i < endFrame; i += 1) {
          let sample = input[i] * dbToGain(gainDbParam[i]);
          if (limiter) {
            sample = Math.tanh(sample);
          }
          out[i] = sample;
        }
        return;
      }

      default: {
        const input = read("in");
        out.set(input.subarray(startFrame, endFrame), startFrame);
      }
    }
  }

  // Render a single voice for the requested frame range by running the compiled node
  // list in order, then validating and returning the designated output buffer.
  renderVoiceFrames(voice, startFrame, endFrame) {
    const signalBuffers = voice.signalBuffers;
    for (const nodeRuntime of this.compiled.nodeRuntimes) {
      this.processNodeFrames(voice, nodeRuntime, signalBuffers, startFrame, endFrame);
    }

    const outNode = this.compiled.nodeById.get(this.compiled.outputNodeId);
    let outputBuffer = null;
    if (this.compiled.outputSignalIndex >= 0) {
      outputBuffer = signalBuffers[this.compiled.outputSignalIndex];
    } else if (this.compiled.fallbackOutputSignalIndex >= 0) {
      outputBuffer = signalBuffers[this.compiled.fallbackOutputSignalIndex];
    } else if (this.compiled.outputInputSourceSignalIndex >= 0) {
      outputBuffer = signalBuffers[this.compiled.outputInputSourceSignalIndex];
    }

    if (!outNode || !outputBuffer) {
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
      voice.nodeState.clear();
      voice.paramState.clear();
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
    this.trackBuffer.fill(0, startFrame, endFrame);

    for (const voice of this.voices) {
      if (!voice.active) continue;
      const voiceOutput = this.renderVoiceFrames(voice, startFrame, endFrame);
      if (!voiceOutput) continue;
      for (let i = startFrame; i < endFrame; i += 1) {
        this.trackBuffer[i] += voiceOutput[i];
      }
    }

    this.applyTrackFxRange(this.trackBuffer, startFrame, endFrame);
    if (this.track.mute && !ignoreMute) {
      return;
    }

    for (let i = startFrame; i < endFrame; i += 1) {
      targetBuffer[i] += this.trackBuffer[i];
    }
  }
}

class SynthWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRateInternal = DEFAULT_SAMPLE_RATE;
    this.blockSize = 128;
    this.project = null;
    this.trackRuntimes = [];
    this.eventQueue = [];
    this.playing = false;
    this.previewing = false;
    this.previewRemainingSamples = 0;
    this.sampleCounter = 0;
    this.songSampleCounter = 0;
    this.transportSessionId = 0;
    this.masterCompressorEnv = 0;
    this.masterBuffer = new Float32Array(this.blockSize);

    this.port.onmessage = (event) => this.onMessage(event.data);
  }

  // Scheduler messages arrive ahead of playback and are kept ordered by absolute
  // song-sample time so block rendering can split precisely at event boundaries.
  enqueueEvents(events) {
    for (const evt of events) {
      if (!evt || !Number.isFinite(evt.sampleTime)) {
        continue;
      }
      this.eventQueue.push(evt);
    }
    this.eventQueue.sort((a, b) => a.sampleTime - b.sampleTime);
  }

  // Main-thread control plane: initializes the processor, swaps in a project,
  // starts/stops transport, appends scheduled events, and applies macro changes.
  onMessage(message) {
    switch (message.type) {
      case "INIT":
        this.sampleRateInternal = message.sampleRate || DEFAULT_SAMPLE_RATE;
        this.blockSize = message.blockSize || 128;
        this.masterBuffer = new Float32Array(this.blockSize);
        break;
      case "SET_PROJECT":
        this.project = message.project;
        this.trackRuntimes = [];
        for (const track of this.project.tracks || []) {
          const patch = (this.project.patches || []).find((entry) => entry.id === track.instrumentPatchId);
          if (!patch) {
            continue;
          }
          try {
            this.trackRuntimes.push(new TrackRuntime(track, patch, this.sampleRateInternal, this.blockSize));
          } catch {
            // Invalid patch graphs are rejected and skipped for runtime safety.
          }
        }
        break;
      case "TRANSPORT":
        this.playing = false;
        this.previewing = false;
        this.previewRemainingSamples = 0;
        this.transportSessionId = Number.isFinite(message.sessionId) ? message.sessionId : this.transportSessionId + 1;
        this.songSampleCounter = Math.max(0, message.songStartSample || 0);
        this.eventQueue.length = 0;
        if (Array.isArray(message.events)) {
          this.enqueueEvents(message.events);
        }
        for (const track of this.trackRuntimes) {
          for (const voice of track.voices) {
            voice.active = false;
            voice.host.gate = 0;
            voice.rms = 0;
          }
        }
        this.playing = Boolean(message.isPlaying);
        break;
      case "PREVIEW":
        this.previewing = false;
        this.playing = false;
        this.songSampleCounter = 0;
        this.eventQueue.length = 0;
        if (Array.isArray(message.events)) {
          this.enqueueEvents(message.events);
        }
        for (const track of this.trackRuntimes) {
          for (const voice of track.voices) {
            voice.active = false;
            voice.host.gate = 0;
            voice.rms = 0;
          }
        }
        this.previewRemainingSamples = Math.max(0, message.durationSamples || 0);
        this.previewing = this.previewRemainingSamples > 0;
        break;
      case "EVENTS":
        if (Number.isFinite(message.sessionId) && message.sessionId !== this.transportSessionId) {
          break;
        }
        if (Array.isArray(message.events)) {
          this.enqueueEvents(message.events);
        }
        break;
      case "MACRO":
        for (const track of this.trackRuntimes) {
          if (track.track.id === message.trackId) {
            track.applyMacro(message.macroId, message.normalized);
          }
        }
        break;
      default:
        break;
    }
  }

  // Event dispatch separates transport-time scheduling from DSP execution. Patch
  // internals never see these events directly; they only observe updated host values
  // and parameter targets during rendering.
  handleEvent(event) {
    if (!this.project || !event || typeof event.type !== "string") {
      return;
    }

    if (event.type === "ParamChange") {
      for (const track of this.trackRuntimes) {
        if (track.patch.id === event.patchId) {
          track.setParam(event.nodeId, event.paramId, event.value);
        }
      }
      return;
    }

    const track = this.trackRuntimes.find((entry) => entry.track.id === event.trackId);
    if (!track) {
      return;
    }

    if (event.type === "NoteOn") {
      track.noteOn(event, this.songSampleCounter);
    } else if (event.type === "NoteOff") {
      track.noteOff(event);
    }
  }

  // Master FX run after all tracks are summed for the frame slice and before samples
  // are copied to the stereo outputs.
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

  // Drain every event whose absolute song sample time is now due before rendering the
  // next slice of the current worklet block.
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

  // Look ahead to the next event boundary so the block can be split into contiguous
  // frame ranges that are internally event-free.
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

  // Render one event-free frame slice: mix all tracks into the master buffer, run
  // master FX, and write the resulting mono signal to both output channels.
  renderFrameRange(left, right, startFrame, endFrame) {
    this.masterBuffer.fill(0, startFrame, endFrame);

    if (this.playing || this.previewing) {
      for (const track of this.trackRuntimes) {
        track.processTrackFrames(this.masterBuffer, startFrame, endFrame, { ignoreMute: this.previewing });
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
          this.previewing = false;
          this.eventQueue.length = 0;
          for (const track of this.trackRuntimes) {
            for (const voice of track.voices) {
              voice.active = false;
              voice.host.gate = 0;
              voice.rms = 0;
            }
          }
        }
      }
      this.sampleCounter += 1;
    }
  }

  // AudioWorklet entry point. The processor iterates through the output block in
  // slices separated by pending events so note/param changes remain sample-accurate
  // without rebuilding the graph for every individual sample.
  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];

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
}

registerProcessor("synth-worklet-processor", SynthWorkletProcessor);
