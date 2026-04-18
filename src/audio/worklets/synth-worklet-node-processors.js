import {
  clamp,
  dbToGain,
  onePoleStep,
  smoothingAlpha,
  voctToHz,
  waveformSample
} from "./synth-worklet-math.js";

const fillNumericParamBuffer = (context, paramId, fallback) => {
  const { runtime, runtimeNode, voice, startFrame, endFrame } = context;
  return runtime.fillNumericParamBuffer(voice, runtimeNode, paramId, fallback, startFrame, endFrame);
};

const getParamValue = (context, paramId, fallback) => {
  const { runtime, runtimeNode } = context;
  return runtime.getParamValue(runtimeNode, paramId, fallback);
};

const createHostValueProcessor = (hostKey) => (context) => {
  const { out, voice, startFrame, endFrame } = context;
  out.fill(voice.host[hostKey], startFrame, endFrame);
};

const processCVTranspose = (context) => {
  const { runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const octavesParam = fillNumericParamBuffer(context, "octaves", Number(runtimeNode.params.octaves ?? 0));
  const semitonesParam = fillNumericParamBuffer(context, "semitones", Number(runtimeNode.params.semitones ?? 0));
  const centsParam = fillNumericParamBuffer(context, "cents", Number(runtimeNode.params.cents ?? 0));

  for (let i = startFrame; i < endFrame; i += 1) {
    out[i] = input[i] + octavesParam[i] + semitonesParam[i] / 12 + centsParam[i] / 1200;
  }
};

const processCVScaler = (context) => {
  const { runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const scaleParam = fillNumericParamBuffer(context, "scale", Number(runtimeNode.params.scale ?? 1));

  for (let i = startFrame; i < endFrame; i += 1) {
    out[i] = input[i] * scaleParam[i];
  }
};

const processCVMixer2 = (context) => {
  const { runtimeNode, out, read, startFrame, endFrame } = context;
  const input1 = read("in1");
  const input2 = read("in2");
  const gain1Param = fillNumericParamBuffer(context, "gain1", Number(runtimeNode.params.gain1 ?? 1));
  const gain2Param = fillNumericParamBuffer(context, "gain2", Number(runtimeNode.params.gain2 ?? 1));

  for (let i = startFrame; i < endFrame; i += 1) {
    out[i] = input1[i] * gain1Param[i] + input2[i] * gain2Param[i];
  }
};

const processVCO = (context) => {
  const { runtime, voice, runtimeNode, out, read, hostPitchBuffer, startFrame, endFrame } = context;
  const phaseState = runtime.getNodeState(voice, runtimeNode, () => ({ phase: 0 }));
  const pitch = read("pitch", hostPitchBuffer);
  const fm = read("fm");
  const pwm = read("pwm");
  const wave = getParamValue(context, "wave", runtimeNode.params.wave);
  const pulseWidthParam = fillNumericParamBuffer(context, "pulseWidth", Number(runtimeNode.params.pulseWidth ?? 0.5));
  const pwmAmountParam = fillNumericParamBuffer(context, "pwmAmount", Number(runtimeNode.params.pwmAmount ?? 0));
  const baseTuneParam = fillNumericParamBuffer(context, "baseTuneCents", Number(runtimeNode.params.baseTuneCents ?? 0));
  const fineTuneParam = fillNumericParamBuffer(context, "fineTuneCents", Number(runtimeNode.params.fineTuneCents ?? 0));

  for (let i = startFrame; i < endFrame; i += 1) {
    const pulseWidth = clamp(pulseWidthParam[i] + pwmAmountParam[i] * pwm[i], 0.05, 0.95);
    const tuneVoct = (baseTuneParam[i] + fineTuneParam[i]) / 1200;
    const hz = voctToHz(pitch[i] + fm[i] + tuneVoct);
    phaseState.phase = (phaseState.phase + hz * runtime.sampleRateInv) % 1;
    out[i] = waveformSample(wave, phaseState.phase, pulseWidth);
  }
};

const processKarplusStrong = (context) => {
  const { runtime, voice, runtimeNode, out, read, hostPitchBuffer, hostGateBuffer, startFrame, endFrame } = context;
  const pitch = read("pitch", hostPitchBuffer);
  const gate = read("gate", hostGateBuffer);
  const excite = read("excite");
  const decayParam = fillNumericParamBuffer(context, "decay", Number(runtimeNode.params.decay ?? 0.94));
  const dampingParam = fillNumericParamBuffer(context, "damping", Number(runtimeNode.params.damping ?? 0.28));
  const brightnessParam = fillNumericParamBuffer(context, "brightness", Number(runtimeNode.params.brightness ?? 0.72));
  const excitation = getParamValue(context, "excitation", runtimeNode.params.excitation || "noise");
  const state =
    runtime.getNodeState(voice, runtimeNode, () => ({
      buf: new Float32Array(runtime.sampleRate * 2),
      write: 0,
      currentDelay: 64,
      last: 0,
      lastGate: 0
    }));

  for (let i = startFrame; i < endFrame; i += 1) {
    const gateValue = gate[i];
    const hz = clamp(voctToHz(pitch[i]), 20, runtime.sampleRate * 0.45);
    const delaySamples = clamp(Math.floor(runtime.sampleRate / hz), 2, state.buf.length - 1);

    if (gateValue >= 0.5 && state.lastGate < 0.5) {
      state.currentDelay = delaySamples;
      const exciteStart = (state.write - delaySamples + state.buf.length) % state.buf.length;
      for (let j = 0; j < delaySamples; j += 1) {
        let source = excite[i];
        if (source === 0) {
          source = excitation === "impulse" ? (j === 0 ? 1 : 0) : Math.random() * 2 - 1;
        }
        const bright = brightnessParam[i];
        const shaped = source * (0.25 + bright * 0.75);
        state.buf[(exciteStart + j) % state.buf.length] = shaped;
      }
    }

    const readIdx = (state.write - state.currentDelay + state.buf.length) % state.buf.length;
    const delayed = state.buf[readIdx];
    const decay = clamp(decayParam[i], 0.7, 0.999);
    const damping = clamp(dampingParam[i], 0, 1);
    const filtered = delayed * (1 - damping) + state.last * damping;
    state.last = filtered;
    state.buf[state.write] = filtered * decay;
    state.write = (state.write + 1) % state.buf.length;
    out[i] = delayed;
    state.lastGate = gateValue;
  }
};

const processLFO = (context) => {
  const { runtime, voice, runtimeNode, out, read, startFrame, endFrame } = context;
  const state = runtime.getNodeState(voice, runtimeNode, () => ({ phase: 0 }));
  const fm = read("fm");
  const freqParam = fillNumericParamBuffer(context, "freqHz", Number(runtimeNode.params.freqHz ?? 1));
  const pulseWidthParam = fillNumericParamBuffer(context, "pulseWidth", Number(runtimeNode.params.pulseWidth ?? 0.5));
  const wave = getParamValue(context, "wave", runtimeNode.params.wave);
  const bipolar = Boolean(getParamValue(context, "bipolar", Boolean(runtimeNode.params.bipolar ?? true)));

  for (let i = startFrame; i < endFrame; i += 1) {
    const freq = clamp(freqParam[i] * Math.pow(2, fm[i]), 0.01, 40);
    const pulseWidth = pulseWidthParam[i];
    state.phase = (state.phase + freq * runtime.sampleRateInv) % 1;
    let sample = waveformSample(wave, state.phase, pulseWidth);
    if (!bipolar) {
      sample = sample * 0.5 + 0.5;
    }
    out[i] = sample;
  }
};

const processADSR = (context) => {
  const { runtime, voice, runtimeNode, out, read, hostGateBuffer, startFrame, endFrame } = context;
  const gate = read("gate", hostGateBuffer);
  const attackParam = fillNumericParamBuffer(context, "attack", Number(runtimeNode.params.attack ?? 0.01));
  const decayParam = fillNumericParamBuffer(context, "decay", Number(runtimeNode.params.decay ?? 0.2));
  const sustainParam = fillNumericParamBuffer(context, "sustain", Number(runtimeNode.params.sustain ?? 0.7));
  const releaseParam = fillNumericParamBuffer(context, "release", Number(runtimeNode.params.release ?? 0.2));
  const mode = getParamValue(context, "mode", runtimeNode.params.mode || "retrigger_from_current");
  const state = runtime.getNodeState(voice, runtimeNode, () => ({ stage: "idle", level: 0, lastGate: 0 }));

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
      state.level += 1 / (attack * runtime.sampleRate);
      if (state.level >= 1) {
        state.level = 1;
        state.stage = "decay";
      }
    } else if (state.stage === "decay") {
      state.level -= (1 - sustain) / (decay * runtime.sampleRate);
      if (state.level <= sustain) {
        state.level = sustain;
        state.stage = "sustain";
      }
    } else if (state.stage === "sustain") {
      state.level = sustain;
    } else if (state.stage === "release") {
      state.level -= Math.max(state.level, 0.001) / (release * runtime.sampleRate);
      if (state.level <= 0.0001) {
        state.level = 0;
        state.stage = "idle";
      }
    }

    state.lastGate = gateValue;
    out[i] = clamp(state.level, 0, 1);
  }
};

const processVCA = (context) => {
  const { runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const gainCv = read("gainCV");
  const biasParam = fillNumericParamBuffer(context, "bias", Number(runtimeNode.params.bias ?? 0));
  const gainParam = fillNumericParamBuffer(context, "gain", Number(runtimeNode.params.gain ?? 1));

  for (let i = startFrame; i < endFrame; i += 1) {
    const gainCvValue = gainCv[i];
    const gainCvNorm = gainCvValue >= 0 && gainCvValue <= 1 ? gainCvValue : gainCvValue * 0.5 + 0.5;
    const gainEff = clamp(biasParam[i] + gainParam[i] * gainCvNorm, 0, 1);
    out[i] = input[i] * gainEff;
  }
};

const processVCF = (context) => {
  const { runtime, voice, runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const cutoffCv = read("cutoffCV");
  const cutoffHzParam = fillNumericParamBuffer(context, "cutoffHz", Number(runtimeNode.params.cutoffHz ?? 1000));
  const resonanceParam = fillNumericParamBuffer(context, "resonance", Number(runtimeNode.params.resonance ?? 0.1));
  const cutoffModParam = fillNumericParamBuffer(context, "cutoffModAmountOct", Number(runtimeNode.params.cutoffModAmountOct ?? 1));
  const type = getParamValue(context, "type", runtimeNode.params.type || "lowpass");
  const state = runtime.getNodeState(voice, runtimeNode, () => ({ lp: 0, bp: 0 }));

  for (let i = startFrame; i < endFrame; i += 1) {
    const cutoffEffective = clamp(cutoffHzParam[i] * Math.pow(2, cutoffCv[i] * cutoffModParam[i]), 20, 20000);
    const resonance = clamp(resonanceParam[i], 0, 1);
    const f = clamp((2 * Math.PI * cutoffEffective) / runtime.sampleRate, 0.001, 0.99);
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
};

const processMixer4 = (context) => {
  const { runtimeNode, out, read, startFrame, endFrame } = context;
  const in1 = read("in1");
  const in2 = read("in2");
  const in3 = read("in3");
  const in4 = read("in4");
  const gain1Param = fillNumericParamBuffer(context, "gain1", Number(runtimeNode.params.gain1 ?? 1));
  const gain2Param = fillNumericParamBuffer(context, "gain2", Number(runtimeNode.params.gain2 ?? 1));
  const gain3Param = fillNumericParamBuffer(context, "gain3", Number(runtimeNode.params.gain3 ?? 1));
  const gain4Param = fillNumericParamBuffer(context, "gain4", Number(runtimeNode.params.gain4 ?? 1));

  for (let i = startFrame; i < endFrame; i += 1) {
    out[i] = in1[i] * gain1Param[i] + in2[i] * gain2Param[i] + in3[i] * gain3Param[i] + in4[i] * gain4Param[i];
  }
};

const processNoise = (context) => {
  const { voice, runtimeNode, out, startFrame, endFrame } = context;
  const color = getParamValue(context, "color", runtimeNode.params.color || "white");
  const gainParam = fillNumericParamBuffer(context, "gain", Number(runtimeNode.params.gain ?? 0.3));
  const state = context.runtime.getNodeState(voice, runtimeNode, () => ({ pink: 0, brown: 0 }));

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
};

const processSamplePlayer = (context) => {
  const { runtime, voice, runtimeNode, out, read, hostPitchBuffer, hostGateBuffer, startFrame, endFrame } = context;
  const gate = read("gate", hostGateBuffer);
  const pitch = read("pitch", hostPitchBuffer);
  const gainParam = fillNumericParamBuffer(context, "gain", Number(runtimeNode.params.gain ?? 1));
  const pitchSemisParam = fillNumericParamBuffer(context, "pitchSemis", Number(runtimeNode.params.pitchSemis ?? 0));
  const mode = getParamValue(context, "mode", runtimeNode.params.mode || "oneshot");
  const startRatio = clamp(Number(runtimeNode.params.start ?? 0), 0, 1);
  const endRatio = clamp(Number(runtimeNode.params.end ?? 1), startRatio + 0.0001, 1);
  const state = runtime.getNodeState(voice, runtimeNode, () => ({
      lastSampleData: null,
      asset: null,
      position: 0,
      active: false,
      lastGate: 0
    }));

  if (state.lastSampleData !== runtimeNode.params.sampleData) {
    state.lastSampleData = runtimeNode.params.sampleData;
    state.asset = parseSampleAsset(runtimeNode.params.sampleData);
    state.position = 0;
    state.active = false;
  }

  const asset = state.asset;
  if (!asset || !asset.samples.length) {
    out.fill(0, startFrame, endFrame);
    return;
  }

  const startSample = clamp(Math.floor(startRatio * asset.samples.length), 0, Math.max(0, asset.samples.length - 1));
  const endSample = clamp(Math.ceil(endRatio * asset.samples.length), startSample + 1, asset.samples.length);

  for (let i = startFrame; i < endFrame; i += 1) {
    const gateValue = gate[i];
    const risingEdge = gateValue >= 0.5 && state.lastGate < 0.5;
    if (risingEdge) {
      state.position = startSample;
      state.active = true;
    }
    state.lastGate = gateValue;

    if (mode === "loop" && gateValue < 0.5) {
      state.active = false;
    }

    if (!state.active) {
      out[i] = 0;
      continue;
    }

    if (state.position >= endSample) {
      if (mode === "loop" && gateValue >= 0.5) {
        state.position = startSample + (state.position - startSample) % Math.max(1, endSample - startSample);
      } else {
        state.active = false;
        out[i] = 0;
        continue;
      }
    }

    const sampleIndex = clamp(state.position, startSample, Math.max(startSample, endSample - 1));
    const baseIndex = Math.floor(sampleIndex);
    const nextIndex = Math.min(endSample - 1, baseIndex + 1);
    const frac = sampleIndex - baseIndex;
    const currentSample = asset.samples[baseIndex] ?? 0;
    const nextSample = asset.samples[nextIndex] ?? currentSample;
    out[i] = (currentSample + (nextSample - currentSample) * frac) * gainParam[i];

    const pitchFactor = Math.pow(2, pitch[i] + pitchSemisParam[i] / 12);
    state.position += pitchFactor * asset.sampleRate / runtime.sampleRate;
  }
};

const processDelay = (context) => {
  const { runtime, voice, runtimeNode, out, read, startFrame, endFrame } = context;
  const state = runtime.getNodeState(voice, runtimeNode, () => ({
    buf: new Float32Array(runtime.sampleRate * 2),
    write: 0
  }));
  const input = read("in");
  const timeMsParam = fillNumericParamBuffer(context, "timeMs", Number(runtimeNode.params.timeMs ?? 300));
  const feedbackParam = fillNumericParamBuffer(context, "feedback", Number(runtimeNode.params.feedback ?? 0.3));
  const mixParam = fillNumericParamBuffer(context, "mix", Number(runtimeNode.params.mix ?? 0.2));

  for (let i = startFrame; i < endFrame; i += 1) {
    const delaySamples = clamp(Math.floor((timeMsParam[i] / 1000) * runtime.sampleRate), 1, state.buf.length - 1);
    const readIdx = (state.write - delaySamples + state.buf.length) % state.buf.length;
    const delayed = state.buf[readIdx];
    const feedback = clamp(feedbackParam[i], 0, 0.95);
    const mix = clamp(mixParam[i], 0, 1);
    const inputSample = input[i];

    state.buf[state.write] = inputSample + delayed * feedback;
    state.write = (state.write + 1) % state.buf.length;
    out[i] = inputSample * (1 - mix) + delayed * mix;
  }
};

const processReverb = (context) => {
  const { runtime, voice, runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const state = runtime.getNodeState(voice, runtimeNode, () => ({
    c1: new Float32Array(Math.floor(runtime.sampleRate * 0.029)),
    c2: new Float32Array(Math.floor(runtime.sampleRate * 0.041)),
    i1: 0,
    i2: 0
  }));
  const sizeParam = fillNumericParamBuffer(context, "size", Number(runtimeNode.params.size ?? 0.5));
  const decayParam = fillNumericParamBuffer(context, "decay", Number(runtimeNode.params.decay ?? 1.5));
  const dampingParam = fillNumericParamBuffer(context, "damping", Number(runtimeNode.params.damping ?? 0.4));
  const mixParam = fillNumericParamBuffer(context, "mix", Number(runtimeNode.params.mix ?? 0.2));

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
};

const processSaturation = (context) => {
  const { runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const driveDbParam = fillNumericParamBuffer(context, "driveDb", Number(runtimeNode.params.driveDb ?? 6));
  const mixParam = fillNumericParamBuffer(context, "mix", Number(runtimeNode.params.mix ?? 0.5));
  const mode = getParamValue(context, "type", runtimeNode.params.type || "tanh");

  for (let i = startFrame; i < endFrame; i += 1) {
    const inputSample = input[i];
    const driven = inputSample * dbToGain(driveDbParam[i]);
    let wet = Math.tanh(driven);
    if (mode === "softclip") {
      const clipped = clamp(driven, -1.5, 1.5);
      wet = clipped - Math.pow(clipped, 3) / 3;
    }
    const mix = clamp(mixParam[i], 0, 1);
    out[i] = inputSample * (1 - mix) + wet * mix;
  }
};

const processOverdrive = (context) => {
  const { voice, runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const gainDbParam = fillNumericParamBuffer(context, "gainDb", Number(runtimeNode.params.gainDb ?? 12));
  const toneParam = fillNumericParamBuffer(context, "tone", Number(runtimeNode.params.tone ?? 0.5));
  const mixParam = fillNumericParamBuffer(context, "mix", Number(runtimeNode.params.mix ?? 0.6));
  const mode = getParamValue(context, "mode", runtimeNode.params.mode || "overdrive");
  const state = context.runtime.getNodeState(voice, runtimeNode, () => ({ toneLp: 0 }));

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
};

const processCompressor = (context) => {
  const { runtime, voice, runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const thresholdDbParam = fillNumericParamBuffer(context, "thresholdDb", Number(runtimeNode.params.thresholdDb ?? -24));
  const ratioParam = fillNumericParamBuffer(context, "ratio", Number(runtimeNode.params.ratio ?? 4));
  const attackMsParam = fillNumericParamBuffer(context, "attackMs", Number(runtimeNode.params.attackMs ?? 10));
  const releaseMsParam = fillNumericParamBuffer(context, "releaseMs", Number(runtimeNode.params.releaseMs ?? 200));
  const makeupDbParam = fillNumericParamBuffer(context, "makeupDb", Number(runtimeNode.params.makeupDb ?? 2));
  const mixParam = fillNumericParamBuffer(context, "mix", Number(runtimeNode.params.mix ?? 1));
  const state = runtime.getNodeState(voice, runtimeNode, () => ({ env: 0 }));

  for (let i = startFrame; i < endFrame; i += 1) {
    const inputSample = input[i];
    const absIn = Math.abs(inputSample);
    const att = smoothingAlpha(Math.max(0.1, attackMsParam[i]), runtime.sampleRate);
    const rel = smoothingAlpha(Math.max(1, releaseMsParam[i]), runtime.sampleRate);
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
};

const processOutput = (context) => {
  const { runtimeNode, out, read, startFrame, endFrame } = context;
  const input = read("in");
  const gainDbParam = fillNumericParamBuffer(context, "gainDb", Number(runtimeNode.params.gainDb ?? -6));
  const limiter = Boolean(getParamValue(context, "limiter", runtimeNode.params.limiter ?? true));

  for (let i = startFrame; i < endFrame; i += 1) {
    let sample = input[i] * dbToGain(gainDbParam[i]);
    if (limiter) {
      sample = Math.tanh(sample);
    }
    out[i] = sample;
  }
};

export const NODE_PROCESSORS = {
  NotePitch: createHostValueProcessor("pitchVoct"),
  NoteGate: createHostValueProcessor("gate"),
  NoteVelocity: createHostValueProcessor("velocity"),
  ModWheel: createHostValueProcessor("modWheel"),
  CVTranspose: processCVTranspose,
  CVScaler: processCVScaler,
  CVMixer2: processCVMixer2,
  VCO: processVCO,
  KarplusStrong: processKarplusStrong,
  LFO: processLFO,
  ADSR: processADSR,
  VCA: processVCA,
  VCF: processVCF,
  Mixer4: processMixer4,
  Noise: processNoise,
  SamplePlayer: processSamplePlayer,
  Delay: processDelay,
  Reverb: processReverb,
  Saturation: processSaturation,
  Overdrive: processOverdrive,
  Compressor: processCompressor,
  Output: processOutput
};

function parseSampleAsset(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.version !== 1 ||
      typeof parsed.sampleRate !== "number" ||
      !Number.isFinite(parsed.sampleRate) ||
      !Array.isArray(parsed.samples)
    ) {
      return null;
    }
    return {
      sampleRate: parsed.sampleRate,
      samples: Float32Array.from(parsed.samples.map((sample) => (typeof sample === "number" && Number.isFinite(sample) ? sample : 0)))
    };
  } catch {
    return null;
  }
}

export const getNodeProcessor = (typeId) => {
  const processor = NODE_PROCESSORS[typeId];
  if (!processor) {
    throw new Error(`No synth worklet processor registered for node type: ${typeId}`);
  }
  return processor;
};
