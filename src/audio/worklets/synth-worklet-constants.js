export const MAX_VOICES = 8;
export const DEFAULT_SAMPLE_RATE = 48000;

export const HOST_NODES = {
  "$host.pitch": { typeId: "NotePitch" },
  "$host.gate": { typeId: "NoteGate" },
  "$host.velocity": { typeId: "NoteVelocity" },
  "$host.modwheel": { typeId: "ModWheel" }
};

export const PARAM_SMOOTHING_MS = {
  CVTranspose: { octaves: 10, semitones: 10, cents: 10 },
  CVScaler: { scale: 10 },
  CVMixer2: { gain1: 10, gain2: 10 },
  VCO: { pulseWidth: 20, baseTuneCents: 10, fineTuneCents: 10, pwmAmount: 20 },
  KarplusStrong: { decay: 20, damping: 20, brightness: 20 },
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

export const PORTS_IN_BY_TYPE = {
  NotePitch: [],
  NoteGate: [],
  NoteVelocity: [],
  ModWheel: [],
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
  SamplePlayer: ["gate", "pitch"],
  Noise: [],
  Delay: ["in"],
  Reverb: ["in"],
  Saturation: ["in"],
  Overdrive: ["in"],
  Compressor: ["in"],
  Output: ["in"]
};

export const TRACK_VOLUME_RANGE = {
  MIN: 0,
  DEFAULT: 1,
  MAX: 2
};

export const EVENT_SORT_PRIORITY = {
  NoteOff: 0,
  ParamChange: 1,
  MacroChange: 2,
  NoteOn: 3
};
