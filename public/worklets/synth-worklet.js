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
  constructor() {
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
    this.signalValues = null;
  }
}

class TrackRuntime {
  constructor(track, patch, sampleRate) {
    this.track = track;
    this.patch = patch;
    this.sampleRate = sampleRate;
    this.compiled = this.compilePatch(patch);
    this.voices = new Array(MAX_VOICES).fill(0).map(() => new VoiceState());
    for (const voice of this.voices) {
      voice.signalValues = new Float32Array(this.compiled.signalCount);
    }
    this.delayState = {
      buf: new Float32Array(sampleRate * 3),
      write: 0,
      lp: 0
    };
    this.reverbState = {
      comb1: new Float32Array(Math.floor(sampleRate * 0.031)),
      comb2: new Float32Array(Math.floor(sampleRate * 0.047)),
      idx1: 0,
      idx2: 0
    };
    this.compressorEnv = 0;
  }

  compilePatch(patch) {
    // Build per-track execution metadata once:
    // - topological node order
    // - destination input -> source signal index lookup table
    // - per-node runtime descriptors with pre-resolved signal indices
    // - mutable param targets and macro table
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
    for (const [id, deg] of indegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const nodeOrder = [];
    while (queue.length) {
      const current = queue.shift();
      nodeOrder.push(current);
      for (const next of adj.get(current) || []) {
        const deg = (indegree.get(next) || 0) - 1;
        indegree.set(next, deg);
        if (deg === 0) queue.push(next);
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
      const key = `${conn.to.nodeId}:${conn.to.portId}`;
      inputSourceByDestKey.set(key, sourceSignalIndex);
    }

    for (const node of patch.nodes) {
      ensureOutputIndex(node.id, "out");
    }
    const fallbackOutputSignalIndex = ensureOutputIndex(outputNodeId, "out");
    const outputSignalIndex = outputPortId === "out" ? fallbackOutputSignalIndex : -1;
    const outputInputSourceSignalIndex = inputSourceByDestKey.get(`${outputNodeId}:${outputPortId}`) ?? -1;

    const nodeRuntimes = [];
    for (const nodeId of nodeOrder) {
      const node = nodeById.get(nodeId);
      if (!node) {
        continue;
      }
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
      outputPortId,
      outputSignalIndex,
      fallbackOutputSignalIndex,
      outputInputSourceSignalIndex,
      hostSignalIndices,
      signalCount: nextSignalIndex
    };
  }

  allocateVoice(sampleTime) {
    const free = this.voices.find((v) => !v.active);
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

  noteOn(event, sampleTime) {
    const existing = this.voices.find((voice) => voice.active && voice.noteId === event.noteId);
    if (existing) {
      existing.lastTriggeredSampleTime = sampleTime;
      existing.host.pitchVoct = event.pitchVoct;
      existing.host.velocity = event.velocity;
      existing.host.gate = 1;
      return;
    }

    // Track lanes are monophonic in the editor model, so reuse one active voice.
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

  setParam(nodeId, paramId, value) {
    const nodeParams = this.compiled.paramTargets.get(nodeId);
    if (!nodeParams) {
      return;
    }
    nodeParams.set(paramId, value);
  }

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

  readInput(signalValues, inputIndex, fallback = 0) {
    // signalValues is "current voice, current sample" storage only.
    // Each source output signal has a compile-time integer index.
    // readInput is a pure array read; it does NOT advance any cursor/read head.
    return inputIndex >= 0 ? signalValues[inputIndex] : fallback;
  }

  getSmoothedParam(voice, nodeId, typeId, paramId, fallback) {
    const nodeParams = this.compiled.paramTargets.get(nodeId);
    const targetRaw = nodeParams && nodeParams.has(paramId) ? nodeParams.get(paramId) : fallback;
    if (typeof targetRaw !== "number") {
      return targetRaw;
    }

    const smoothingMs = PARAM_SMOOTHING_MS[typeId] && PARAM_SMOOTHING_MS[typeId][paramId] ? PARAM_SMOOTHING_MS[typeId][paramId] : 0;
    let nodeParamState = voice.paramState.get(nodeId);
    if (!nodeParamState) {
      nodeParamState = new Map();
      voice.paramState.set(nodeId, nodeParamState);
    }
    const prev = nodeParamState.get(paramId);
    if (prev === undefined) {
      nodeParamState.set(paramId, targetRaw);
      return targetRaw;
    }

    if (smoothingMs <= 0) {
      nodeParamState.set(paramId, targetRaw);
      return targetRaw;
    }

    const alpha = smoothingAlpha(smoothingMs, this.sampleRate);
    const next = onePoleStep(prev, targetRaw, alpha);
    nodeParamState.set(paramId, next);
    return next;
  }

  processNodeSample(voice, runtimeNode, signalValues) {
    // Evaluate exactly one node for exactly one sample of one voice.
    // Inputs are pulled from signalValues (already-computed upstream outputs for
    // this same sample), then this node writes its output sample back to signalValues.
    // The per-sample ordering guarantee comes from compilePatch topological sort.
    const { id, typeId, params, outIndex, inputs } = runtimeNode;
    const read = (portId, fallback = 0) => this.readInput(signalValues, inputs[portId] ?? -1, fallback);

    if (typeId === "NotePitch") {
      signalValues[outIndex] = voice.host.pitchVoct;
      return;
    }
    if (typeId === "NoteGate") {
      signalValues[outIndex] = voice.host.gate;
      return;
    }
    if (typeId === "NoteVelocity") {
      signalValues[outIndex] = voice.host.velocity;
      return;
    }
    if (typeId === "ModWheel") {
      signalValues[outIndex] = voice.host.modWheel;
      return;
    }

    switch (typeId) {
      case "VCO": {
        const phaseState = voice.nodeState.get(id) || { phase: 0 };
        const pitch = read("pitch", voice.host.pitchVoct);
        const fm = read("fm", 0);
        const pwm = read("pwm", 0);
        const wave = this.getSmoothedParam(voice, id, typeId, "wave", params.wave);
        const pulseWidth = clamp(
          this.getSmoothedParam(voice, id, typeId, "pulseWidth", Number(params.pulseWidth ?? 0.5)) +
            this.getSmoothedParam(voice, id, typeId, "pwmAmount", Number(params.pwmAmount ?? 0)) * pwm,
          0.05,
          0.95
        );
        const tuneCents =
          this.getSmoothedParam(voice, id, typeId, "baseTuneCents", Number(params.baseTuneCents ?? 0)) +
          this.getSmoothedParam(voice, id, typeId, "fineTuneCents", Number(params.fineTuneCents ?? 0));

        const tuneVoct = tuneCents / 1200;
        const hz = voctToHz(pitch + fm + tuneVoct);
        phaseState.phase = (phaseState.phase + hz / this.sampleRate) % 1;
        const sample = waveformSample(wave, phaseState.phase, pulseWidth);
        voice.nodeState.set(id, phaseState);
        signalValues[outIndex] = sample;
        return;
      }

      case "LFO": {
        const state = voice.nodeState.get(id) || { phase: 0 };
        const fm = read("fm", 0);
        const freq = clamp(
          this.getSmoothedParam(voice, id, typeId, "freqHz", Number(params.freqHz ?? 1)) * Math.pow(2, fm),
          0.01,
          40
        );
        const wave = this.getSmoothedParam(voice, id, typeId, "wave", params.wave);
        const pw = this.getSmoothedParam(voice, id, typeId, "pulseWidth", Number(params.pulseWidth ?? 0.5));
        const bipolar = Boolean(this.getSmoothedParam(voice, id, typeId, "bipolar", Boolean(params.bipolar ?? true)));

        state.phase = (state.phase + freq / this.sampleRate) % 1;
        let sample = waveformSample(wave, state.phase, pw);
        if (!bipolar) {
          sample = sample * 0.5 + 0.5;
        }
        voice.nodeState.set(id, state);
        signalValues[outIndex] = sample;
        return;
      }

      case "ADSR": {
        const gate = read("gate", voice.host.gate);
        const attack = Math.max(0.0001, this.getSmoothedParam(voice, id, typeId, "attack", Number(params.attack ?? 0.01)));
        const decay = Math.max(0.0001, this.getSmoothedParam(voice, id, typeId, "decay", Number(params.decay ?? 0.2)));
        const sustain = clamp(
          this.getSmoothedParam(voice, id, typeId, "sustain", Number(params.sustain ?? 0.7)),
          0,
          1
        );
        const release = Math.max(0.0001, this.getSmoothedParam(voice, id, typeId, "release", Number(params.release ?? 0.2)));

        const state = voice.nodeState.get(id) || {
          stage: "idle",
          level: 0,
          lastGate: 0
        };

        if (gate >= 0.5 && state.lastGate < 0.5) {
          if ((params.mode || "retrigger_from_current") === "retrigger_from_zero") {
            state.level = 0;
          }
          state.stage = "attack";
        } else if (gate < 0.5 && state.lastGate >= 0.5) {
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

        state.lastGate = gate;
        voice.nodeState.set(id, state);
        signalValues[outIndex] = clamp(state.level, 0, 1);
        return;
      }

      case "VCA": {
        const input = read("in", 0);
        const gainCv = read("gainCV", 1);
        const bias = this.getSmoothedParam(voice, id, typeId, "bias", Number(params.bias ?? 0));
        const gain = this.getSmoothedParam(voice, id, typeId, "gain", Number(params.gain ?? 1));
        const gainCvNorm = gainCv >= 0 && gainCv <= 1 ? gainCv : gainCv * 0.5 + 0.5;
        const gainEff = clamp(bias + gain * gainCvNorm, 0, 1);
        signalValues[outIndex] = input * gainEff;
        return;
      }

      case "VCF": {
        const input = read("in", 0);
        const cutoffCv = read("cutoffCV", 0);

        const cutoffHz = this.getSmoothedParam(voice, id, typeId, "cutoffHz", Number(params.cutoffHz ?? 1000));
        const resonance = clamp(this.getSmoothedParam(voice, id, typeId, "resonance", Number(params.resonance ?? 0.1)), 0, 1);
        const cutoffModAmount = this.getSmoothedParam(voice, id, typeId, "cutoffModAmountOct", Number(params.cutoffModAmountOct ?? 1));

        const cutoffEffective = clamp(cutoffHz * Math.pow(2, cutoffCv * cutoffModAmount), 20, 20000);
        const f = clamp((2 * Math.PI * cutoffEffective) / this.sampleRate, 0.001, 0.99);

        const state = voice.nodeState.get(id) || { lp: 0, bp: 0 };
        const hp = input - state.lp - resonance * state.bp;
        state.bp += f * hp;
        state.lp += f * state.bp;

        const type = params.type || "lowpass";
        let out = state.lp;
        if (type === "highpass") out = hp;
        if (type === "bandpass") out = state.bp;

        voice.nodeState.set(id, state);
        signalValues[outIndex] = out;
        return;
      }

      case "Mixer4": {
        const in1 = read("in1", 0);
        const in2 = read("in2", 0);
        const in3 = read("in3", 0);
        const in4 = read("in4", 0);
        const g1 = this.getSmoothedParam(voice, id, typeId, "gain1", Number(params.gain1 ?? 1));
        const g2 = this.getSmoothedParam(voice, id, typeId, "gain2", Number(params.gain2 ?? 1));
        const g3 = this.getSmoothedParam(voice, id, typeId, "gain3", Number(params.gain3 ?? 1));
        const g4 = this.getSmoothedParam(voice, id, typeId, "gain4", Number(params.gain4 ?? 1));
        signalValues[outIndex] = in1 * g1 + in2 * g2 + in3 * g3 + in4 * g4;
        return;
      }

      case "Noise": {
        const color = params.color || "white";
        const gain = this.getSmoothedParam(voice, id, typeId, "gain", Number(params.gain ?? 0.3));
        const state = voice.nodeState.get(id) || { pink: 0, brown: 0 };
        const white = Math.random() * 2 - 1;
        let sample = white;
        if (color === "pink") {
          state.pink = 0.98 * state.pink + 0.02 * white;
          sample = state.pink;
        }
        if (color === "brown") {
          state.brown = clamp(state.brown + white * 0.02, -1, 1);
          sample = state.brown;
        }
        voice.nodeState.set(id, state);
        signalValues[outIndex] = sample * gain;
        return;
      }

      case "SamplePlayer": {
        signalValues[outIndex] = 0;
        return;
      }

      case "Delay": {
        const state = voice.nodeState.get(id) || {
          buf: new Float32Array(this.sampleRate * 2),
          write: 0
        };
        const input = read("in", 0);
        const timeMs = this.getSmoothedParam(voice, id, typeId, "timeMs", Number(params.timeMs ?? 300));
        const feedback = clamp(this.getSmoothedParam(voice, id, typeId, "feedback", Number(params.feedback ?? 0.3)), 0, 0.95);
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(params.mix ?? 0.2)), 0, 1);

        const delaySamples = clamp(Math.floor((timeMs / 1000) * this.sampleRate), 1, state.buf.length - 1);
        const readIdx = (state.write - delaySamples + state.buf.length) % state.buf.length;
        const delayed = state.buf[readIdx];

        state.buf[state.write] = input + delayed * feedback;
        state.write = (state.write + 1) % state.buf.length;
        voice.nodeState.set(id, state);

        signalValues[outIndex] = input * (1 - mix) + delayed * mix;
        return;
      }

      case "Reverb": {
        const input = read("in", 0);
        const state = voice.nodeState.get(id) || {
          c1: new Float32Array(Math.floor(this.sampleRate * 0.029)),
          c2: new Float32Array(Math.floor(this.sampleRate * 0.041)),
          i1: 0,
          i2: 0
        };
        const size = this.getSmoothedParam(voice, id, typeId, "size", Number(params.size ?? 0.5));
        const decay = this.getSmoothedParam(voice, id, typeId, "decay", Number(params.decay ?? 1.5));
        const damping = this.getSmoothedParam(voice, id, typeId, "damping", Number(params.damping ?? 0.4));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(params.mix ?? 0.2)), 0, 1);

        const fb = clamp(0.2 + size * 0.7, 0, 0.95) * clamp(decay / 10, 0, 1);

        const c1 = state.c1[state.i1];
        const c2 = state.c2[state.i2];
        state.c1[state.i1] = input + (c1 * fb - c1 * damping * 0.05);
        state.c2[state.i2] = input + (c2 * fb - c2 * damping * 0.05);

        state.i1 = (state.i1 + 1) % state.c1.length;
        state.i2 = (state.i2 + 1) % state.c2.length;
        voice.nodeState.set(id, state);

        const wet = (c1 + c2) * 0.5;
        signalValues[outIndex] = input * (1 - mix) + wet * mix;
        return;
      }

      case "Saturation": {
        const input = read("in", 0);
        const driveDb = this.getSmoothedParam(voice, id, typeId, "driveDb", Number(params.driveDb ?? 6));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(params.mix ?? 0.5)), 0, 1);
        const mode = params.type || "tanh";
        const driven = input * dbToGain(driveDb);
        let wet = Math.tanh(driven);
        if (mode === "softclip") {
          wet = clamp(driven, -1.5, 1.5);
          wet = wet - (Math.pow(wet, 3) / 3);
        }
        signalValues[outIndex] = input * (1 - mix) + wet * mix;
        return;
      }

      case "Overdrive": {
        const input = read("in", 0);
        const gainDb = this.getSmoothedParam(voice, id, typeId, "gainDb", Number(params.gainDb ?? 12));
        const tone = this.getSmoothedParam(voice, id, typeId, "tone", Number(params.tone ?? 0.5));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(params.mix ?? 0.6)), 0, 1);
        const mode = params.mode || "overdrive";
        const state = voice.nodeState.get(id) || { toneLp: 0 };

        let driven = input * dbToGain(gainDb);
        if (mode === "fuzz") {
          driven = clamp(driven, -1, 1);
          driven = Math.sign(driven) * Math.pow(Math.abs(driven), 0.5);
        } else {
          driven = Math.tanh(driven);
        }

        const toneAlpha = clamp(0.01 + tone * 0.2, 0.01, 0.3);
        state.toneLp = state.toneLp + (driven - state.toneLp) * toneAlpha;
        voice.nodeState.set(id, state);

        signalValues[outIndex] = input * (1 - mix) + state.toneLp * mix;
        return;
      }

      case "Compressor": {
        const input = read("in", 0);
        const thresholdDb = this.getSmoothedParam(
          voice,
          id,
          typeId,
          "thresholdDb",
          Number(params.thresholdDb ?? -24)
        );
        const ratio = this.getSmoothedParam(voice, id, typeId, "ratio", Number(params.ratio ?? 4));
        const attackMs = this.getSmoothedParam(voice, id, typeId, "attackMs", Number(params.attackMs ?? 10));
        const releaseMs = this.getSmoothedParam(
          voice,
          id,
          typeId,
          "releaseMs",
          Number(params.releaseMs ?? 200)
        );
        const makeupDb = this.getSmoothedParam(voice, id, typeId, "makeupDb", Number(params.makeupDb ?? 2));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(params.mix ?? 1)), 0, 1);

        const state = voice.nodeState.get(id) || { env: 0 };
        const absIn = Math.abs(input);
        const att = smoothingAlpha(Math.max(0.1, attackMs), this.sampleRate);
        const rel = smoothingAlpha(Math.max(1, releaseMs), this.sampleRate);
        const alpha = absIn > state.env ? att : rel;
        state.env = onePoleStep(state.env, absIn, alpha);

        const levelDb = 20 * Math.log10(Math.max(state.env, 0.00001));
        const over = Math.max(levelDb - thresholdDb, 0);
        const reducedDb = over - over / Math.max(1, ratio);
        const gain = dbToGain(makeupDb - reducedDb);
        const wet = input * gain;

        voice.nodeState.set(id, state);
        signalValues[outIndex] = input * (1 - mix) + wet * mix;
        return;
      }

      case "Output": {
        const input = read("in", 0);
        const gainDb = this.getSmoothedParam(voice, id, typeId, "gainDb", Number(params.gainDb ?? -6));
        const limiter = Boolean(params.limiter ?? true);
        let out = input * dbToGain(gainDb);
        if (limiter) {
          out = Math.tanh(out);
        }
        signalValues[outIndex] = out;
        return;
      }

      default:
        signalValues[outIndex] = read("in", 0);
    }
  }

  renderVoiceSample(voice) {
    // Per-voice signal values for the current sample.
    // Stateful continuity across samples lives in voice.nodeState/paramState.
    const signalValues = voice.signalValues;
    const hostSignalIndices = this.compiled.hostSignalIndices;
    signalValues[hostSignalIndices.pitch] = voice.host.pitchVoct;
    signalValues[hostSignalIndices.gate] = voice.host.gate;
    signalValues[hostSignalIndices.velocity] = voice.host.velocity;
    signalValues[hostSignalIndices.modWheel] = voice.host.modWheel;

    for (const nodeRuntime of this.compiled.nodeRuntimes) {
      this.processNodeSample(voice, nodeRuntime, signalValues);
    }

    const outNode = this.compiled.nodeById.get(this.compiled.outputNodeId);

    let sample = 0;
    if (this.compiled.outputSignalIndex >= 0) {
      sample = signalValues[this.compiled.outputSignalIndex];
    } else if (this.compiled.fallbackOutputSignalIndex >= 0) {
      sample = signalValues[this.compiled.fallbackOutputSignalIndex];
    } else if (this.compiled.outputInputSourceSignalIndex >= 0) {
      sample = signalValues[this.compiled.outputInputSourceSignalIndex];
    }

    if (!outNode) {
      sample = 0;
    }

    if (!Number.isFinite(sample)) {
      voice.active = false;
      voice.noteId = null;
      voice.host.gate = 0;
      voice.rms = 0;
      voice.nodeState.clear();
      voice.paramState.clear();
      return 0;
    }

    voice.rms = voice.rms * 0.995 + Math.abs(sample) * 0.005;
    if (voice.host.gate < 0.5 && voice.rms < 0.0005) {
      voice.active = false;
      voice.noteId = null;
    }

    return sample;
  }

  processTrackSample() {
    // Per-sample track render:
    // sum active voices -> apply fixed track FX -> respect mute.
    let sample = 0;
    for (const voice of this.voices) {
      if (!voice.active) continue;
      sample += this.renderVoiceSample(voice);
    }

    if (!Number.isFinite(sample)) {
      sample = 0;
    }
    sample = this.applyTrackFx(sample);
    if (this.track.mute) {
      return 0;
    }
    return sample;
  }

  applyTrackFx(input) {
    let out = input;
    const fx = this.track.fx || {};

    if (fx.delayEnabled) {
      const timeSamples = clamp(Math.floor(this.sampleRate * 0.24), 1, this.delayState.buf.length - 1);
      const read = (this.delayState.write - timeSamples + this.delayState.buf.length) % this.delayState.buf.length;
      const delayed = this.delayState.buf[read];
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

    if (!Number.isFinite(out)) {
      return 0;
    }
    return out;
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
    this.sampleCounter = 0;
    this.songSampleCounter = 0;
    this.transportSessionId = 0;

    this.masterCompressorEnv = 0;

    this.port.onmessage = (event) => this.onMessage(event.data);
  }

  enqueueEvents(events) {
    // Scheduler sends future events ahead of time; keep queue ordered so process()
    // can consume all events due at the current song sample.
    for (const evt of events) {
      if (!evt || !Number.isFinite(evt.sampleTime)) {
        continue;
      }
      this.eventQueue.push(evt);
    }
    this.eventQueue.sort((a, b) => a.sampleTime - b.sampleTime);
  }

  onMessage(message) {
    switch (message.type) {
      case "INIT":
        this.sampleRateInternal = message.sampleRate || DEFAULT_SAMPLE_RATE;
        this.blockSize = message.blockSize || 128;
        break;
      case "SET_PROJECT":
        this.project = message.project;
        this.trackRuntimes = [];
        for (const track of this.project.tracks || []) {
          const patch = (this.project.patches || []).find((p) => p.id === track.instrumentPatchId);
          if (!patch) {
            continue;
          }
          try {
            this.trackRuntimes.push(new TrackRuntime(track, patch, this.sampleRateInternal));
          } catch {
            // Invalid patch graphs are rejected and skipped for runtime safety.
          }
        }
        break;
      case "TRANSPORT":
        this.playing = false;
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
          if (track.patch.id === message.patchId) {
            track.applyMacro(message.macroId, message.normalized);
          }
        }
        break;
      default:
        break;
    }
  }

  handleEvent(event) {
    if (!this.project) return;
    if (!event || typeof event.type !== "string") return;

    if (event.type === "ParamChange") {
      for (const track of this.trackRuntimes) {
        if (track.patch.id === event.patchId) {
          track.setParam(event.nodeId, event.paramId, event.value);
        }
      }
      return;
    }

    const track = this.trackRuntimes.find((entry) => entry.track.id === event.trackId);
    if (!track) return;

    if (event.type === "NoteOn") {
      track.noteOn(event, this.songSampleCounter);
    } else if (event.type === "NoteOff") {
      track.noteOff(event);
    }
  }

  applyMasterFx(input) {
    if (!this.project) return input;

    let out = input;
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

    if (!Number.isFinite(out)) {
      return 0;
    }
    return out;
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
      const event = this.eventQueue.shift();
      this.handleEvent(event);
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
    for (let i = startFrame; i < endFrame; i += 1) {
      let mixed = 0;
      if (this.playing) {
        for (const track of this.trackRuntimes) {
          mixed += track.processTrackSample();
        }
      }

      mixed = this.applyMasterFx(mixed);
      if (!Number.isFinite(mixed)) {
        mixed = 0;
      }
      left[i] = mixed;
      right[i] = mixed;
      if (this.playing) {
        this.songSampleCounter += 1;
      }
      this.sampleCounter += 1;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];

    // AudioWorklet callback: render one block as a sequence of frame ranges.
    // Boundaries are split on event timestamps to preserve sample-accurate timing.
    let frame = 0;
    while (frame < left.length) {
      this.consumeDueEvents();

      let segmentEnd = left.length;
      if (this.playing) {
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
