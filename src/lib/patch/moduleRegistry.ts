import { ModuleTypeSchema, ParamSchema, PatchModuleCategory, PortSchema, Unit } from "@/types/patch";

const floatParam = (
  id: string,
  label: string,
  min: number,
  max: number,
  unit: Unit,
  doc: string,
  options?: { default?: number; map?: "linear" | "exp"; smoothingMs?: number; step?: number }
): ParamSchema => ({
  id,
  label,
  type: "float",
  default: options?.default ?? min,
  range: { min, max },
  step: options?.step,
  unit,
  map: options?.map ?? "linear",
  smoothing: options?.smoothingMs ? { kind: "one_pole", timeMs: options.smoothingMs } : null,
  doc
});

const enumParam = (id: string, label: string, values: string[], defaultValue: string, doc: string): ParamSchema => ({
  id,
  label,
  type: "enum",
  options: values,
  default: defaultValue,
  doc
});

const boolParam = (id: string, label: string, defaultValue: boolean, doc: string): ParamSchema => ({
  id,
  label,
  type: "bool",
  default: defaultValue,
  doc
});

const port = (
  id: string,
  label: string,
  capabilities: Array<"AUDIO" | "CV" | "GATE">,
  doc: string,
  multiIn = false
): PortSchema => ({
  id,
  label,
  kind: "signal",
  capabilities,
  multiIn,
  doc
});

export const HOST_TYPE_IDS = ["NotePitch", "NoteGate", "NoteVelocity", "ModWheel"] as const;

const categories = (...values: PatchModuleCategory[]): PatchModuleCategory[] => values;

export const moduleRegistry: ModuleTypeSchema[] = [
  {
    typeId: "NotePitch",
    categories: categories("host", "cv"),
    hostOnly: true,
    doc: { summary: "Per-voice pitch in V/Oct (0=C4)." },
    requiredPortIds: {},
    params: [],
    portsIn: [],
    portsOut: [port("out", "Out", ["CV"], "Per-voice V/Oct pitch")]
  },
  {
    typeId: "NoteGate",
    categories: categories("host", "cv"),
    hostOnly: true,
    doc: { summary: "Per-voice gate (1 while note held)." },
    requiredPortIds: {},
    params: [],
    portsIn: [],
    portsOut: [port("out", "Out", ["GATE"], "Per-voice gate")]
  },
  {
    typeId: "NoteVelocity",
    categories: categories("host", "cv"),
    hostOnly: true,
    doc: { summary: "Per-voice velocity (0..1)." },
    requiredPortIds: {},
    params: [],
    portsIn: [],
    portsOut: [port("out", "Out", ["CV"], "Per-voice velocity")]
  },
  {
    typeId: "ModWheel",
    categories: categories("host", "cv"),
    hostOnly: true,
    doc: { summary: "Per-voice mod wheel (0..1)." },
    requiredPortIds: {},
    params: [],
    portsIn: [],
    portsOut: [port("out", "Out", ["CV"], "Per-voice modulation wheel")]
  },
  {
    typeId: "CVTranspose",
    categories: categories("cv"),
    doc: { summary: "Transposes a pitch CV by octaves, semitones, and cents." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("octaves", "Octaves", -4, 4, "VperOct", "Pitch offset in octaves", {
        default: 0,
        smoothingMs: 10,
        step: 1
      }),
      floatParam("semitones", "Semitones", -11, 11, "semitones", "Pitch offset in semitones", {
        default: 0,
        smoothingMs: 10,
        step: 1
      }),
      floatParam("cents", "Cents", -100, 100, "cents", "Fine pitch offset in cents", {
        default: 0,
        smoothingMs: 10,
        step: 1
      })
    ],
    portsIn: [port("in", "In", ["CV"], "Input CV")],
    portsOut: [port("out", "Out", ["CV"], "Transposed CV")]
  },
  {
    typeId: "CVScaler",
    categories: categories("cv"),
    doc: { summary: "Scales or inverts a CV signal." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("scale", "Scale", -2, 2, "linear", "Scale amount; negative values invert", {
        default: 1,
        smoothingMs: 10
      })
    ],
    portsIn: [port("in", "In", ["CV"], "Input CV")],
    portsOut: [port("out", "Out", ["CV"], "Scaled CV")]
  },
  {
    typeId: "CVMixer2",
    categories: categories("mix", "cv"),
    doc: { summary: "Sums two CV sources with independent gains." },
    requiredPortIds: { out: ["out"] },
    params: [
      floatParam("gain1", "Gain 1", -2, 2, "linear", "Gain for input 1", {
        default: 1,
        smoothingMs: 10
      }),
      floatParam("gain2", "Gain 2", -2, 2, "linear", "Gain for input 2", {
        default: 1,
        smoothingMs: 10
      })
    ],
    portsIn: [port("in1", "In 1", ["CV"], "First CV input"), port("in2", "In 2", ["CV"], "Second CV input")],
    portsOut: [port("out", "Out", ["CV"], "Mixed CV output")]
  },
  {
    typeId: "VCO",
    categories: categories("source"),
    doc: { summary: "Waveform oscillator controlled by V/Oct pitch and optional FM/PWM." },
    requiredPortIds: { in: ["pitch"], out: ["out"] },
    params: [
      enumParam("wave", "Wave", ["sine", "triangle", "saw", "square"], "saw", "Oscillator waveform"),
      floatParam("pulseWidth", "Pulse Width", 0.05, 0.95, "ratio", "Pulse wave duty cycle", {
        default: 0.5,
        smoothingMs: 20
      }),
      floatParam("baseTuneCents", "Base Tune", -1200, 1200, "cents", "Coarse tuning", {
        default: 0,
        smoothingMs: 10
      }),
      floatParam("fineTuneCents", "Fine Tune", -100, 100, "cents", "Fine tuning", {
        default: 0,
        smoothingMs: 10
      }),
      floatParam("pwmAmount", "PWM Amount", 0, 0.5, "ratio", "Pulse width modulation amount", {
        default: 0,
        smoothingMs: 20
      })
    ],
    portsIn: [
      port("pitch", "Pitch", ["CV"], "Pitch V/Oct"),
      port("fm", "FM", ["CV"], "Frequency modulation V/Oct"),
      port("pwm", "PWM", ["CV"], "Pulse width modulation")
    ],
    portsOut: [port("out", "Out", ["AUDIO"], "Oscillator output")]
  },
  {
    typeId: "KarplusStrong",
    categories: categories("source", "processor"),
    doc: { summary: "Plucked-string resonator with internal delay and feedback." },
    requiredPortIds: { in: ["pitch", "gate"], out: ["out"] },
    params: [
      floatParam("decay", "Decay", 0.7, 0.999, "linear", "Feedback decay amount", {
        default: 0.94,
        smoothingMs: 20
      }),
      floatParam("damping", "Damping", 0, 1, "linear", "High-frequency damping in the feedback path", {
        default: 0.28,
        smoothingMs: 20
      }),
      floatParam("brightness", "Brightness", 0, 1, "linear", "Excitation brightness", {
        default: 0.72,
        smoothingMs: 20
      }),
      enumParam("excitation", "Excitation", ["noise", "impulse"], "noise", "Excitation source when no input is patched")
    ],
    portsIn: [
      port("pitch", "Pitch", ["CV"], "Pitch V/Oct"),
      port("gate", "Gate", ["GATE"], "Excitation trigger"),
      port("excite", "Excite", ["AUDIO", "CV"], "Optional external excitation")
    ],
    portsOut: [port("out", "Out", ["AUDIO"], "Resonated output")]
  },
  {
    typeId: "LFO",
    categories: categories("cv", "source"),
    doc: { summary: "Low-frequency oscillator for modulation." },
    requiredPortIds: { out: ["out"] },
    params: [
      enumParam("wave", "Wave", ["sine", "triangle", "saw", "square"], "sine", "LFO waveform"),
      floatParam("freqHz", "Frequency", 0.01, 40, "Hz", "LFO frequency", {
        default: 3,
        map: "exp",
        smoothingMs: 50
      }),
      floatParam("pulseWidth", "Pulse Width", 0.05, 0.95, "ratio", "Pulse duty cycle", {
        default: 0.5,
        smoothingMs: 20
      }),
      boolParam("bipolar", "Bipolar", true, "Output bipolar signal when true")
    ],
    portsIn: [port("fm", "FM", ["CV"], "LFO frequency modulation")],
    portsOut: [port("out", "Out", ["CV"], "LFO output")]
  },
  {
    typeId: "ADSR",
    categories: categories("envelope", "cv"),
    doc: { summary: "Envelope generator triggered by gate." },
    requiredPortIds: { in: ["gate"], out: ["out"] },
    params: [
      floatParam("attack", "Attack", 0, 10, "s", "Attack time", { default: 0.01, smoothingMs: 10 }),
      floatParam("decay", "Decay", 0, 10, "s", "Decay time", { default: 0.2, smoothingMs: 10 }),
      floatParam("sustain", "Sustain", 0, 1, "linear", "Sustain level", { default: 0.7, smoothingMs: 10 }),
      floatParam("release", "Release", 0, 10, "s", "Release time", { default: 0.25, smoothingMs: 10 }),
      enumParam(
        "mode",
        "Retrigger Mode",
        ["retrigger_from_zero", "retrigger_from_current"],
        "retrigger_from_current",
        "Retrigger behavior"
      )
    ],
    portsIn: [port("gate", "Gate", ["GATE"], "Envelope gate trigger")],
    portsOut: [port("out", "Out", ["CV"], "Envelope output")]
  },
  {
    typeId: "VCA",
    categories: categories("processor", "cv"),
    doc: { summary: "Multiplies input by gain controlled by CV. Use for audio or modulation depth." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("bias", "Bias", 0, 1, "linear", "Bias gain", { default: 0, smoothingMs: 10 }),
      floatParam("gain", "Gain", 0, 1, "linear", "CV gain amount", { default: 1, smoothingMs: 10 })
    ],
    portsIn: [
      port("in", "In", ["AUDIO", "CV"], "Input signal"),
      port("gainCV", "Gain CV", ["CV"], "Gain control signal")
    ],
    portsOut: [port("out", "Out", ["AUDIO", "CV"], "Amplified output")]
  },
  {
    typeId: "VCF",
    categories: categories("processor"),
    doc: { summary: "Filter with cutoff and resonance; cutoff CV modulates around base cutoff." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      enumParam("type", "Type", ["lowpass", "highpass", "bandpass"], "lowpass", "Filter type"),
      floatParam("cutoffHz", "Cutoff", 20, 20000, "Hz", "Filter cutoff", {
        default: 1000,
        map: "exp",
        smoothingMs: 20
      }),
      floatParam("resonance", "Resonance", 0, 1, "linear", "Resonance amount", { default: 0.1, smoothingMs: 10 }),
      floatParam("cutoffModAmountOct", "Cutoff Mod", 0, 6, "oct", "CV modulation in octaves", {
        default: 1,
        smoothingMs: 10
      })
    ],
    portsIn: [
      port("in", "In", ["AUDIO"], "Audio input"),
      port("cutoffCV", "Cutoff CV", ["CV"], "Cutoff modulation")
    ],
    portsOut: [port("out", "Out", ["AUDIO"], "Filtered output")]
  },
  {
    typeId: "Mixer4",
    categories: categories("mix"),
    doc: { summary: "Sums up to 4 audio inputs with per-channel gain." },
    requiredPortIds: { out: ["out"] },
    params: [
      floatParam("gain1", "Gain 1", 0, 1, "linear", "Input 1 gain", { default: 1, smoothingMs: 10 }),
      floatParam("gain2", "Gain 2", 0, 1, "linear", "Input 2 gain", { default: 1, smoothingMs: 10 }),
      floatParam("gain3", "Gain 3", 0, 1, "linear", "Input 3 gain", { default: 1, smoothingMs: 10 }),
      floatParam("gain4", "Gain 4", 0, 1, "linear", "Input 4 gain", { default: 1, smoothingMs: 10 })
    ],
    portsIn: [
      port("in1", "In 1", ["AUDIO"], "Input 1"),
      port("in2", "In 2", ["AUDIO"], "Input 2"),
      port("in3", "In 3", ["AUDIO"], "Input 3"),
      port("in4", "In 4", ["AUDIO"], "Input 4")
    ],
    portsOut: [port("out", "Out", ["AUDIO"], "Mixed output")]
  },
  {
    typeId: "SamplePlayer",
    categories: categories("source"),
    doc: { summary: "Plays a loaded sample. Pitch shifts by resampling (MVP)." },
    requiredPortIds: { in: ["gate"], out: ["out"] },
    params: [
      enumParam("mode", "Mode", ["oneshot", "loop"], "oneshot", "Playback mode"),
      floatParam("start", "Start", 0, 1, "ratio", "Start point", { default: 0 }),
      floatParam("end", "End", 0, 1, "ratio", "End point", { default: 1 }),
      floatParam("gain", "Gain", 0, 1, "linear", "Output gain", { default: 1, smoothingMs: 10 }),
      floatParam("pitchSemis", "Pitch", -48, 48, "semitones", "Pitch shift in semitones", {
        default: 0,
        smoothingMs: 10
      })
    ],
    portsIn: [port("gate", "Gate", ["GATE"], "Playback gate"), port("pitch", "Pitch", ["CV"], "Pitch CV")],
    portsOut: [port("out", "Out", ["AUDIO"], "Sample output")]
  },
  {
    typeId: "Noise",
    categories: categories("source"),
    doc: { summary: "Noise generator." },
    requiredPortIds: { out: ["out"] },
    params: [
      enumParam("color", "Color", ["white", "pink", "brown"], "white", "Noise color"),
      floatParam("gain", "Gain", 0, 1, "linear", "Noise gain", { default: 0.3, smoothingMs: 10 })
    ],
    portsIn: [],
    portsOut: [port("out", "Out", ["AUDIO"], "Noise output")]
  },
  {
    typeId: "Delay",
    categories: categories("processor"),
    doc: { summary: "Delay with feedback and wet/dry mix." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("timeMs", "Time", 1, 2000, "ms", "Delay time", { default: 300, map: "exp", smoothingMs: 30 }),
      floatParam("feedback", "Feedback", 0, 0.95, "linear", "Feedback amount", { default: 0.3, smoothingMs: 30 }),
      floatParam("mix", "Mix", 0, 1, "linear", "Wet/dry mix", { default: 0.2, smoothingMs: 10 })
    ],
    portsIn: [port("in", "In", ["AUDIO"], "Audio input")],
    portsOut: [port("out", "Out", ["AUDIO"], "Delayed output")]
  },
  {
    typeId: "Reverb",
    categories: categories("processor"),
    doc: { summary: "Algorithmic reverb (MVP)." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("size", "Size", 0, 1, "linear", "Room size", { default: 0.5, smoothingMs: 50 }),
      floatParam("decay", "Decay", 0.1, 10, "s", "Reverb decay", { default: 1.5, map: "exp", smoothingMs: 50 }),
      floatParam("damping", "Damping", 0, 1, "linear", "High frequency damping", { default: 0.4, smoothingMs: 50 }),
      floatParam("mix", "Mix", 0, 1, "linear", "Wet mix", { default: 0.25, smoothingMs: 10 })
    ],
    portsIn: [port("in", "In", ["AUDIO"], "Audio input")],
    portsOut: [port("out", "Out", ["AUDIO"], "Reverb output")]
  },
  {
    typeId: "Saturation",
    categories: categories("processor"),
    doc: { summary: "Soft saturation/distortion." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("driveDb", "Drive", 0, 24, "dB", "Input drive", { default: 6, smoothingMs: 20 }),
      floatParam("mix", "Mix", 0, 1, "linear", "Wet mix", { default: 0.5, smoothingMs: 10 }),
      enumParam("type", "Type", ["tanh", "softclip"], "tanh", "Saturation shape")
    ],
    portsIn: [port("in", "In", ["AUDIO"], "Audio input")],
    portsOut: [port("out", "Out", ["AUDIO"], "Processed output")]
  },
  {
    typeId: "Overdrive",
    categories: categories("processor"),
    doc: { summary: "Heavier distortion/fuzz-style overdrive." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("gainDb", "Gain", 0, 36, "dB", "Drive gain", { default: 12, smoothingMs: 20 }),
      floatParam("tone", "Tone", 0, 1, "linear", "Tone tilt", { default: 0.5, smoothingMs: 20 }),
      floatParam("mix", "Mix", 0, 1, "linear", "Wet mix", { default: 0.6, smoothingMs: 10 }),
      enumParam("mode", "Mode", ["overdrive", "fuzz"], "overdrive", "Drive mode")
    ],
    portsIn: [port("in", "In", ["AUDIO"], "Audio input")],
    portsOut: [port("out", "Out", ["AUDIO"], "Processed output")]
  },
  {
    typeId: "Compressor",
    categories: categories("processor"),
    doc: { summary: "Dynamics compressor." },
    requiredPortIds: { in: ["in"], out: ["out"] },
    params: [
      floatParam("thresholdDb", "Threshold", -60, 0, "dB", "Threshold", { default: -24, smoothingMs: 50 }),
      floatParam("ratio", "Ratio", 1, 20, "ratio", "Compression ratio", { default: 4, smoothingMs: 50 }),
      floatParam("attackMs", "Attack", 0.1, 200, "ms", "Attack time", { default: 10, map: "exp", smoothingMs: 50 }),
      floatParam("releaseMs", "Release", 10, 2000, "ms", "Release time", { default: 200, map: "exp", smoothingMs: 50 }),
      floatParam("makeupDb", "Makeup", 0, 24, "dB", "Makeup gain", { default: 2, smoothingMs: 50 }),
      floatParam("mix", "Mix", 0, 1, "linear", "Dry/wet", { default: 1, smoothingMs: 10 })
    ],
    portsIn: [port("in", "In", ["AUDIO"], "Audio input")],
    portsOut: [port("out", "Out", ["AUDIO"], "Compressed output")]
  },
  {
    typeId: "Output",
    categories: categories("host", "mix"),
    hostOnly: true,
    doc: { summary: "Final output sink for instrument patch." },
    requiredPortIds: { in: ["in"] },
    params: [
      floatParam("gainDb", "Gain", -60, 6, "dB", "Output gain", { default: -6, smoothingMs: 30 }),
      boolParam("limiter", "Limiter", true, "Enable safety clipper")
    ],
    portsIn: [port("in", "In", ["AUDIO"], "Audio input")],
    portsOut: []
  }
];

export const moduleRegistryById = new Map(moduleRegistry.map((m) => [m.typeId, m] as const));

export const getModuleSchema = (typeId: string): ModuleTypeSchema | undefined => moduleRegistryById.get(typeId);

export const createDefaultParamsForType = (typeId: string): Record<string, number | string | boolean> => {
  const schema = getModuleSchema(typeId);
  if (!schema) {
    throw new Error(`Unknown module type: ${typeId}`);
  }
  return Object.fromEntries(schema.params.map((param) => [param.id, param.default]));
};

export const modulePalette = moduleRegistry.filter((module) => !module.hostOnly);
