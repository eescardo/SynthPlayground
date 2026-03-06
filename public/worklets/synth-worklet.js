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
  }
}

class TrackRuntime {
  constructor(track, patch, sampleRate) {
    this.track = track;
    this.patch = patch;
    this.sampleRate = sampleRate;
    this.compiled = this.compilePatch(patch);
    this.voices = new Array(MAX_VOICES).fill(0).map(() => new VoiceState());
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

    const inputMap = new Map();
    for (const conn of patch.connections) {
      const key = `${conn.to.nodeId}:${conn.to.portId}`;
      inputMap.set(key, { nodeId: conn.from.nodeId, portId: conn.from.portId });
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
      nodeOrder,
      inputMap,
      paramTargets,
      macroById,
      outputNodeId,
      outputPortId
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

  readInput(signalMap, nodeId, portId, fallback = 0) {
    const src = this.compiled.inputMap.get(`${nodeId}:${portId}`);
    if (!src) return fallback;
    const key = `${src.nodeId}:${src.portId}`;
    return signalMap.has(key) ? signalMap.get(key) : fallback;
  }

  getSmoothedParam(voice, nodeId, typeId, paramId, fallback) {
    const nodeParams = this.compiled.paramTargets.get(nodeId);
    const targetRaw = nodeParams && nodeParams.has(paramId) ? nodeParams.get(paramId) : fallback;
    if (typeof targetRaw !== "number") {
      return targetRaw;
    }

    const smoothingMs = PARAM_SMOOTHING_MS[typeId] && PARAM_SMOOTHING_MS[typeId][paramId] ? PARAM_SMOOTHING_MS[typeId][paramId] : 0;
    const key = `${nodeId}:${paramId}`;
    const prev = voice.paramState.get(key);
    if (!prev) {
      voice.paramState.set(key, targetRaw);
      return targetRaw;
    }

    if (smoothingMs <= 0) {
      voice.paramState.set(key, targetRaw);
      return targetRaw;
    }

    const alpha = smoothingAlpha(smoothingMs, this.sampleRate);
    const next = onePoleStep(prev, targetRaw, alpha);
    voice.paramState.set(key, next);
    return next;
  }

  processNodeSample(voice, node, signalMap) {
    const id = node.id;
    const typeId = node.typeId;

    if (typeId === "NotePitch") {
      signalMap.set(`${id}:out`, voice.host.pitchVoct);
      return;
    }
    if (typeId === "NoteGate") {
      signalMap.set(`${id}:out`, voice.host.gate);
      return;
    }
    if (typeId === "NoteVelocity") {
      signalMap.set(`${id}:out`, voice.host.velocity);
      return;
    }
    if (typeId === "ModWheel") {
      signalMap.set(`${id}:out`, voice.host.modWheel);
      return;
    }

    switch (typeId) {
      case "VCO": {
        const phaseState = voice.nodeState.get(id) || { phase: 0 };
        const pitch = this.readInput(signalMap, id, "pitch", voice.host.pitchVoct);
        const fm = this.readInput(signalMap, id, "fm", 0);
        const pwm = this.readInput(signalMap, id, "pwm", 0);
        const wave = this.getSmoothedParam(voice, id, typeId, "wave", node.params.wave);
        const pulseWidth = clamp(
          this.getSmoothedParam(voice, id, typeId, "pulseWidth", Number(node.params.pulseWidth ?? 0.5)) +
            this.getSmoothedParam(voice, id, typeId, "pwmAmount", Number(node.params.pwmAmount ?? 0)) * pwm,
          0.05,
          0.95
        );
        const tuneCents =
          this.getSmoothedParam(voice, id, typeId, "baseTuneCents", Number(node.params.baseTuneCents ?? 0)) +
          this.getSmoothedParam(voice, id, typeId, "fineTuneCents", Number(node.params.fineTuneCents ?? 0));

        const tuneVoct = tuneCents / 1200;
        const hz = voctToHz(pitch + fm + tuneVoct);
        phaseState.phase = (phaseState.phase + hz / this.sampleRate) % 1;
        const sample = waveformSample(wave, phaseState.phase, pulseWidth);
        voice.nodeState.set(id, phaseState);
        signalMap.set(`${id}:out`, sample);
        return;
      }

      case "LFO": {
        const state = voice.nodeState.get(id) || { phase: 0 };
        const fm = this.readInput(signalMap, id, "fm", 0);
        const freq = clamp(
          this.getSmoothedParam(voice, id, typeId, "freqHz", Number(node.params.freqHz ?? 1)) * Math.pow(2, fm),
          0.01,
          40
        );
        const wave = this.getSmoothedParam(voice, id, typeId, "wave", node.params.wave);
        const pw = this.getSmoothedParam(voice, id, typeId, "pulseWidth", Number(node.params.pulseWidth ?? 0.5));
        const bipolar = Boolean(this.getSmoothedParam(voice, id, typeId, "bipolar", Boolean(node.params.bipolar ?? true)));

        state.phase = (state.phase + freq / this.sampleRate) % 1;
        let sample = waveformSample(wave, state.phase, pw);
        if (!bipolar) {
          sample = sample * 0.5 + 0.5;
        }
        voice.nodeState.set(id, state);
        signalMap.set(`${id}:out`, sample);
        return;
      }

      case "ADSR": {
        const gate = this.readInput(signalMap, id, "gate", voice.host.gate);
        const attack = Math.max(0.0001, this.getSmoothedParam(voice, id, typeId, "attack", Number(node.params.attack ?? 0.01)));
        const decay = Math.max(0.0001, this.getSmoothedParam(voice, id, typeId, "decay", Number(node.params.decay ?? 0.2)));
        const sustain = clamp(
          this.getSmoothedParam(voice, id, typeId, "sustain", Number(node.params.sustain ?? 0.7)),
          0,
          1
        );
        const release = Math.max(
          0.0001,
          this.getSmoothedParam(voice, id, typeId, "release", Number(node.params.release ?? 0.2))
        );

        const state = voice.nodeState.get(id) || {
          stage: "idle",
          level: 0,
          lastGate: 0
        };

        if (gate >= 0.5 && state.lastGate < 0.5) {
          if ((node.params.mode || "retrigger_from_current") === "retrigger_from_zero") {
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
        signalMap.set(`${id}:out`, clamp(state.level, 0, 1));
        return;
      }

      case "VCA": {
        const input = this.readInput(signalMap, id, "in", 0);
        const gainCv = this.readInput(signalMap, id, "gainCV", 1);
        const bias = this.getSmoothedParam(voice, id, typeId, "bias", Number(node.params.bias ?? 0));
        const gain = this.getSmoothedParam(voice, id, typeId, "gain", Number(node.params.gain ?? 1));
        const gainCvNorm = gainCv >= 0 && gainCv <= 1 ? gainCv : gainCv * 0.5 + 0.5;
        const gainEff = clamp(bias + gain * gainCvNorm, 0, 1);
        signalMap.set(`${id}:out`, input * gainEff);
        return;
      }

      case "VCF": {
        const input = this.readInput(signalMap, id, "in", 0);
        const cutoffCv = this.readInput(signalMap, id, "cutoffCV", 0);

        const cutoffHz = this.getSmoothedParam(voice, id, typeId, "cutoffHz", Number(node.params.cutoffHz ?? 1000));
        const resonance = clamp(
          this.getSmoothedParam(voice, id, typeId, "resonance", Number(node.params.resonance ?? 0.1)),
          0,
          1
        );
        const cutoffModAmount = this.getSmoothedParam(
          voice,
          id,
          typeId,
          "cutoffModAmountOct",
          Number(node.params.cutoffModAmountOct ?? 1)
        );

        const cutoffEffective = clamp(cutoffHz * Math.pow(2, cutoffCv * cutoffModAmount), 20, 20000);
        const f = clamp((2 * Math.PI * cutoffEffective) / this.sampleRate, 0.001, 0.99);

        const state = voice.nodeState.get(id) || { lp: 0, bp: 0 };
        const hp = input - state.lp - resonance * state.bp;
        state.bp += f * hp;
        state.lp += f * state.bp;

        const type = node.params.type || "lowpass";
        let out = state.lp;
        if (type === "highpass") out = hp;
        if (type === "bandpass") out = state.bp;

        voice.nodeState.set(id, state);
        signalMap.set(`${id}:out`, out);
        return;
      }

      case "Mixer4": {
        const in1 = this.readInput(signalMap, id, "in1", 0);
        const in2 = this.readInput(signalMap, id, "in2", 0);
        const in3 = this.readInput(signalMap, id, "in3", 0);
        const in4 = this.readInput(signalMap, id, "in4", 0);
        const g1 = this.getSmoothedParam(voice, id, typeId, "gain1", Number(node.params.gain1 ?? 1));
        const g2 = this.getSmoothedParam(voice, id, typeId, "gain2", Number(node.params.gain2 ?? 1));
        const g3 = this.getSmoothedParam(voice, id, typeId, "gain3", Number(node.params.gain3 ?? 1));
        const g4 = this.getSmoothedParam(voice, id, typeId, "gain4", Number(node.params.gain4 ?? 1));
        signalMap.set(`${id}:out`, in1 * g1 + in2 * g2 + in3 * g3 + in4 * g4);
        return;
      }

      case "Noise": {
        const color = node.params.color || "white";
        const gain = this.getSmoothedParam(voice, id, typeId, "gain", Number(node.params.gain ?? 0.3));
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
        signalMap.set(`${id}:out`, sample * gain);
        return;
      }

      case "SamplePlayer": {
        signalMap.set(`${id}:out`, 0);
        return;
      }

      case "Delay": {
        const state = voice.nodeState.get(id) || {
          buf: new Float32Array(this.sampleRate * 2),
          write: 0
        };
        const input = this.readInput(signalMap, id, "in", 0);
        const timeMs = this.getSmoothedParam(voice, id, typeId, "timeMs", Number(node.params.timeMs ?? 300));
        const feedback = clamp(
          this.getSmoothedParam(voice, id, typeId, "feedback", Number(node.params.feedback ?? 0.3)),
          0,
          0.95
        );
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(node.params.mix ?? 0.2)), 0, 1);

        const delaySamples = clamp(Math.floor((timeMs / 1000) * this.sampleRate), 1, state.buf.length - 1);
        const read = (state.write - delaySamples + state.buf.length) % state.buf.length;
        const delayed = state.buf[read];

        state.buf[state.write] = input + delayed * feedback;
        state.write = (state.write + 1) % state.buf.length;
        voice.nodeState.set(id, state);

        signalMap.set(`${id}:out`, input * (1 - mix) + delayed * mix);
        return;
      }

      case "Reverb": {
        const input = this.readInput(signalMap, id, "in", 0);
        const state = voice.nodeState.get(id) || {
          c1: new Float32Array(Math.floor(this.sampleRate * 0.029)),
          c2: new Float32Array(Math.floor(this.sampleRate * 0.041)),
          i1: 0,
          i2: 0
        };
        const size = this.getSmoothedParam(voice, id, typeId, "size", Number(node.params.size ?? 0.5));
        const decay = this.getSmoothedParam(voice, id, typeId, "decay", Number(node.params.decay ?? 1.5));
        const damping = this.getSmoothedParam(voice, id, typeId, "damping", Number(node.params.damping ?? 0.4));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(node.params.mix ?? 0.2)), 0, 1);

        const fb = clamp(0.2 + size * 0.7, 0, 0.95) * clamp(decay / 10, 0, 1);

        const c1 = state.c1[state.i1];
        const c2 = state.c2[state.i2];
        state.c1[state.i1] = input + (c1 * fb - c1 * damping * 0.05);
        state.c2[state.i2] = input + (c2 * fb - c2 * damping * 0.05);

        state.i1 = (state.i1 + 1) % state.c1.length;
        state.i2 = (state.i2 + 1) % state.c2.length;
        voice.nodeState.set(id, state);

        const wet = (c1 + c2) * 0.5;
        signalMap.set(`${id}:out`, input * (1 - mix) + wet * mix);
        return;
      }

      case "Saturation": {
        const input = this.readInput(signalMap, id, "in", 0);
        const driveDb = this.getSmoothedParam(voice, id, typeId, "driveDb", Number(node.params.driveDb ?? 6));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(node.params.mix ?? 0.5)), 0, 1);
        const mode = node.params.type || "tanh";
        const driven = input * dbToGain(driveDb);
        let wet = Math.tanh(driven);
        if (mode === "softclip") {
          wet = clamp(driven, -1.5, 1.5);
          wet = wet - (Math.pow(wet, 3) / 3);
        }
        signalMap.set(`${id}:out`, input * (1 - mix) + wet * mix);
        return;
      }

      case "Overdrive": {
        const input = this.readInput(signalMap, id, "in", 0);
        const gainDb = this.getSmoothedParam(voice, id, typeId, "gainDb", Number(node.params.gainDb ?? 12));
        const tone = this.getSmoothedParam(voice, id, typeId, "tone", Number(node.params.tone ?? 0.5));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(node.params.mix ?? 0.6)), 0, 1);
        const mode = node.params.mode || "overdrive";
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

        signalMap.set(`${id}:out`, input * (1 - mix) + state.toneLp * mix);
        return;
      }

      case "Compressor": {
        const input = this.readInput(signalMap, id, "in", 0);
        const thresholdDb = this.getSmoothedParam(
          voice,
          id,
          typeId,
          "thresholdDb",
          Number(node.params.thresholdDb ?? -24)
        );
        const ratio = this.getSmoothedParam(voice, id, typeId, "ratio", Number(node.params.ratio ?? 4));
        const attackMs = this.getSmoothedParam(voice, id, typeId, "attackMs", Number(node.params.attackMs ?? 10));
        const releaseMs = this.getSmoothedParam(
          voice,
          id,
          typeId,
          "releaseMs",
          Number(node.params.releaseMs ?? 200)
        );
        const makeupDb = this.getSmoothedParam(voice, id, typeId, "makeupDb", Number(node.params.makeupDb ?? 2));
        const mix = clamp(this.getSmoothedParam(voice, id, typeId, "mix", Number(node.params.mix ?? 1)), 0, 1);

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
        signalMap.set(`${id}:out`, input * (1 - mix) + wet * mix);
        return;
      }

      case "Output": {
        const input = this.readInput(signalMap, id, "in", 0);
        const gainDb = this.getSmoothedParam(voice, id, typeId, "gainDb", Number(node.params.gainDb ?? -6));
        const limiter = Boolean(node.params.limiter ?? true);
        let out = input * dbToGain(gainDb);
        if (limiter) {
          out = Math.tanh(out);
        }
        signalMap.set(`${id}:out`, out);
        return;
      }

      default:
        signalMap.set(`${id}:out`, this.readInput(signalMap, id, "in", 0));
    }
  }

  renderVoiceSample(voice) {
    const signalMap = new Map();
    signalMap.set("$host.pitch:out", voice.host.pitchVoct);
    signalMap.set("$host.gate:out", voice.host.gate);
    signalMap.set("$host.velocity:out", voice.host.velocity);
    signalMap.set("$host.modwheel:out", voice.host.modWheel);

    for (const nodeId of this.compiled.nodeOrder) {
      const node = this.compiled.nodeById.get(nodeId);
      if (!node) continue;
      this.processNodeSample(voice, node, signalMap);
    }

    const outNode = this.compiled.nodeById.get(this.compiled.outputNodeId);
    const configuredKey = `${this.compiled.outputNodeId}:${this.compiled.outputPortId}`;
    const fallbackOutKey = `${this.compiled.outputNodeId}:out`;

    let sample = 0;
    if (signalMap.has(configuredKey)) {
      sample = signalMap.get(configuredKey);
    } else if (signalMap.has(fallbackOutKey)) {
      sample = signalMap.get(fallbackOutKey);
    } else {
      sample = this.readInput(signalMap, this.compiled.outputNodeId, this.compiled.outputPortId, 0);
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

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];

    for (let i = 0; i < left.length; i += 1) {
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

    return true;
  }
}

registerProcessor("synth-worklet-processor", SynthWorkletProcessor);
