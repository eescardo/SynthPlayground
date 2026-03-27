import { createDefaultParamsForType } from "@/lib/patch/moduleRegistry";
import { HOST_NODE_IDS } from "@/lib/patch/constants";
import { createId } from "@/lib/ids";
import { Project, Track } from "@/types/music";
import { Patch } from "@/types/patch";

const outputNode = (id: string) => ({
  id,
  typeId: "Output",
  params: {
    ...createDefaultParamsForType("Output")
  }
});

const noteCore = {
  pitch: HOST_NODE_IDS.pitch,
  gate: HOST_NODE_IDS.gate,
  velocity: HOST_NODE_IDS.velocity,
  mod: HOST_NODE_IDS.modWheel
};

export const bassPatch = (): Patch => {
  const patchId = "preset_bass";
  const vcoId = "vco1";
  const envId = "env1";
  const vcaId = "vca1";
  const vcfId = "vcf1";
  const outId = "out1";

  return {
    schemaVersion: 1,
    id: patchId,
    name: "Bass",
    meta: { source: "preset", presetId: "preset_bass", presetVersion: 1 },
    nodes: [
      {
        id: vcoId,
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "saw",
          fineTuneCents: -6
        }
      },
      {
        id: envId,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0.01,
          decay: 0.18,
          sustain: 0.45,
          release: 0.2
        }
      },
      {
        id: vcaId,
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1
        }
      },
      {
        id: vcfId,
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "lowpass",
          cutoffHz: 180,
          resonance: 0.3,
          cutoffModAmountOct: 2.5
        }
      },
      outputNode(outId)
    ],
    connections: [
      {
        id: "c1",
        from: { nodeId: noteCore.pitch, portId: "out" },
        to: { nodeId: vcoId, portId: "pitch" }
      },
      {
        id: "c2",
        from: { nodeId: noteCore.gate, portId: "out" },
        to: { nodeId: envId, portId: "gate" }
      },
      {
        id: "c3",
        from: { nodeId: vcoId, portId: "out" },
        to: { nodeId: vcfId, portId: "in" }
      },
      {
        id: "c4",
        from: { nodeId: envId, portId: "out" },
        to: { nodeId: vcaId, portId: "gainCV" }
      },
      {
        id: "c5",
        from: { nodeId: vcfId, portId: "out" },
        to: { nodeId: vcaId, portId: "in" }
      },
      {
        id: "c6",
        from: { nodeId: envId, portId: "out" },
        to: { nodeId: vcfId, portId: "cutoffCV" }
      },
      {
        id: "c7",
        from: { nodeId: vcaId, portId: "out" },
        to: { nodeId: outId, portId: "in" }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_cutoff",
          name: "Cutoff",
          defaultNormalized: 0.22,
          bindings: [
            {
              id: "b1",
              nodeId: vcfId,
              paramId: "cutoffHz",
              map: "exp",
              min: 80,
              max: 3200
            }
          ]
        },
        {
          id: "macro_decay",
          name: "Decay",
          defaultNormalized: 0.2,
          bindings: [
            {
              id: "b2",
              nodeId: envId,
              paramId: "decay",
              map: "linear",
              min: 0.05,
              max: 0.7
            },
            {
              id: "b3",
              nodeId: envId,
              paramId: "release",
              map: "linear",
              min: 0.05,
              max: 0.8
            }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vcoId, x: 2, y: 2 },
        { nodeId: envId, x: 2, y: 6 },
        { nodeId: vcfId, x: 6, y: 2 },
        { nodeId: vcaId, x: 10, y: 2 },
        { nodeId: outId, x: 14, y: 2 }
      ]
    },
    io: {
      audioOutNodeId: outId,
      audioOutPortId: "in"
    }
  };
};

export const padPatch = (): Patch => {
  const vco1 = "vco1";
  const vco2 = "vco2";
  const lfo = "lfo1";
  const mix = "mix1";
  const env = "env1";
  const vcf = "vcf1";
  const vca = "vca1";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_pad",
    name: "Pad",
    meta: { source: "preset", presetId: "preset_pad", presetVersion: 4 },
    nodes: [
      {
        id: vco1,
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "saw", fineTuneCents: -7 }
      },
      {
        id: vco2,
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "square",
          pulseWidth: 0.42,
          pwmAmount: 0.18,
          fineTuneCents: 7
        }
      },
      { id: lfo, typeId: "LFO", params: { ...createDefaultParamsForType("LFO"), wave: "triangle", freqHz: 0.18 } },
      { id: mix, typeId: "Mixer4", params: { ...createDefaultParamsForType("Mixer4"), gain1: 0.46, gain2: 0.4 } },
      {
        id: env,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 1.1,
          decay: 0.9,
          sustain: 0.78,
          release: 1.2
        }
      },
      {
        id: vcf,
        typeId: "VCF",
        params: { ...createDefaultParamsForType("VCF"), cutoffHz: 1450, resonance: 0.16, cutoffModAmountOct: 1.6 }
      },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), bias: 0, gain: 1 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco1, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco2, portId: "pitch" } },
      { id: "c3", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: env, portId: "gate" } },
      { id: "c4", from: { nodeId: lfo, portId: "out" }, to: { nodeId: vco2, portId: "pwm" } },
      { id: "c5", from: { nodeId: vco1, portId: "out" }, to: { nodeId: mix, portId: "in1" } },
      { id: "c6", from: { nodeId: vco2, portId: "out" }, to: { nodeId: mix, portId: "in2" } },
      { id: "c7", from: { nodeId: lfo, portId: "out" }, to: { nodeId: vcf, portId: "cutoffCV" } },
      { id: "c8", from: { nodeId: mix, portId: "out" }, to: { nodeId: vcf, portId: "in" } },
      { id: "c9", from: { nodeId: vcf, portId: "out" }, to: { nodeId: vca, portId: "in" } },
      { id: "c10", from: { nodeId: env, portId: "out" }, to: { nodeId: vca, portId: "gainCV" } },
      { id: "c11", from: { nodeId: vca, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_attack",
          name: "Attack",
          defaultNormalized: 0.34,
          bindings: [{ id: "b1", nodeId: env, paramId: "attack", map: "linear", min: 0.05, max: 3.2 }]
        },
        {
          id: "macro_release",
          name: "Release",
          defaultNormalized: 0.32,
          bindings: [{ id: "b6", nodeId: env, paramId: "release", map: "linear", min: 0.15, max: 2.4 }]
        },
        {
          id: "macro_motion",
          name: "Motion",
          defaultNormalized: 0.46,
          bindings: [
            { id: "b2", nodeId: lfo, paramId: "freqHz", map: "exp", min: 0.04, max: 4.5 },
            { id: "b3", nodeId: vco2, paramId: "pwmAmount", map: "linear", min: 0.03, max: 0.42 },
            { id: "b4", nodeId: vcf, paramId: "cutoffModAmountOct", map: "linear", min: 0.4, max: 2.5 },
            { id: "b5", nodeId: vcf, paramId: "cutoffHz", map: "exp", min: 700, max: 3600 }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vco1, x: 2, y: 2 },
        { nodeId: vco2, x: 2, y: 6 },
        { nodeId: lfo, x: 2, y: 10 },
        { nodeId: mix, x: 7, y: 4 },
        { nodeId: env, x: 7, y: 10 },
        { nodeId: vcf, x: 11, y: 4 },
        { nodeId: vca, x: 15, y: 4 },
        { nodeId: out, x: 19, y: 4 }
      ]
    },
    io: { audioOutNodeId: out, audioOutPortId: "in" }
  };
};

export const pluckPatch = (): Patch => {
  const vco = "vco1";
  const noise = "noise1";
  const ampEnv = "env1";
  const pickEnv = "env2";
  const pickVca = "vca1";
  const mix = "mix1";
  const filter = "vcf1";
  const ampVca = "vca2";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_pluck",
    name: "Pluck",
    meta: { source: "preset", presetId: "preset_pluck", presetVersion: 3 },
    nodes: [
      {
        id: vco,
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "saw", fineTuneCents: -3 }
      },
      { id: noise, typeId: "Noise", params: { ...createDefaultParamsForType("Noise"), color: "white", gain: 0.12 } },
      {
        id: ampEnv,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 0.3,
          sustain: 0,
          release: 0.24
        }
      },
      {
        id: pickEnv,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 0.035,
          sustain: 0,
          release: 0.025
        }
      },
      { id: pickVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), bias: 0, gain: 0.75 } },
      {
        id: mix,
        typeId: "Mixer4",
        params: { ...createDefaultParamsForType("Mixer4"), gain1: 0.95, gain2: 0.1, gain3: 0, gain4: 0 }
      },
      {
        id: filter,
        typeId: "VCF",
        params: { ...createDefaultParamsForType("VCF"), cutoffHz: 1450, resonance: 0.14, cutoffModAmountOct: 1.1 }
      },
      { id: ampVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), bias: 0, gain: 1 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: ampEnv, portId: "gate" } },
      { id: "c3", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: pickEnv, portId: "gate" } },
      { id: "c4", from: { nodeId: noise, portId: "out" }, to: { nodeId: pickVca, portId: "in" } },
      { id: "c5", from: { nodeId: pickEnv, portId: "out" }, to: { nodeId: pickVca, portId: "gainCV" } },
      { id: "c6", from: { nodeId: vco, portId: "out" }, to: { nodeId: mix, portId: "in1" } },
      { id: "c7", from: { nodeId: pickVca, portId: "out" }, to: { nodeId: mix, portId: "in2" } },
      { id: "c8", from: { nodeId: mix, portId: "out" }, to: { nodeId: filter, portId: "in" } },
      { id: "c9", from: { nodeId: ampEnv, portId: "out" }, to: { nodeId: filter, portId: "cutoffCV" } },
      { id: "c10", from: { nodeId: filter, portId: "out" }, to: { nodeId: ampVca, portId: "in" } },
      { id: "c11", from: { nodeId: ampEnv, portId: "out" }, to: { nodeId: ampVca, portId: "gainCV" } },
      { id: "c12", from: { nodeId: ampVca, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_tone",
          name: "Tone",
          defaultNormalized: 0.46,
          bindings: [{ id: "b1", nodeId: filter, paramId: "cutoffHz", map: "exp", min: 280, max: 5200 }]
        },
        {
          id: "macro_decay",
          name: "Decay",
          defaultNormalized: 0.28,
          bindings: [
            { id: "b2", nodeId: ampEnv, paramId: "decay", map: "linear", min: 0.08, max: 1.05 },
            { id: "b3", nodeId: ampEnv, paramId: "release", map: "linear", min: 0.06, max: 0.65 }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vco, x: 2, y: 3 },
        { nodeId: noise, x: 2, y: 8 },
        { nodeId: ampEnv, x: 2, y: 13 },
        { nodeId: pickEnv, x: 6, y: 13 },
        { nodeId: pickVca, x: 6, y: 8 },
        { nodeId: mix, x: 10, y: 5 },
        { nodeId: filter, x: 14, y: 5 },
        { nodeId: ampVca, x: 18, y: 5 },
        { nodeId: out, x: 22, y: 5 }
      ]
    },
    io: { audioOutNodeId: out, audioOutPortId: "in" }
  };
};

export const keysPatch = (): Patch => {
  const vco = "vco1";
  const env = "env1";
  const vca = "vca1";
  const sat = "sat1";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_keys",
    name: "Simple Piano-ish",
    meta: { source: "preset", presetId: "preset_keys", presetVersion: 1 },
    nodes: [
      { id: vco, typeId: "VCO", params: { ...createDefaultParamsForType("VCO"), wave: "triangle" } },
      {
        id: env,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0.001, decay: 0.25, sustain: 0.1, release: 0.3 }
      },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 1, bias: 0 } },
      { id: sat, typeId: "Saturation", params: { ...createDefaultParamsForType("Saturation"), driveDb: 6, mix: 0.25 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: env, portId: "gate" } },
      { id: "c3", from: { nodeId: vco, portId: "out" }, to: { nodeId: vca, portId: "in" } },
      { id: "c4", from: { nodeId: env, portId: "out" }, to: { nodeId: vca, portId: "gainCV" } },
      { id: "c5", from: { nodeId: vca, portId: "out" }, to: { nodeId: sat, portId: "in" } },
      { id: "c6", from: { nodeId: sat, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_brightness",
          name: "Brightness",
          defaultNormalized: 0.33,
          bindings: [{ id: "b1", nodeId: sat, paramId: "driveDb", map: "linear", min: 0, max: 18 }]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vco, x: 2, y: 4 },
        { nodeId: env, x: 2, y: 9 },
        { nodeId: vca, x: 8, y: 4 },
        { nodeId: sat, x: 12, y: 4 },
        { nodeId: out, x: 16, y: 4 }
      ]
    },
    io: { audioOutNodeId: out, audioOutPortId: "in" }
  };
};

export const brassPatch = (): Patch => {
  const vco = "vco1";
  const lfo = "lfo1";
  const env = "env1";
  const vcf = "vcf1";
  const vca = "vca1";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_brass",
    name: "Brass-ish",
    meta: { source: "preset", presetId: "preset_brass", presetVersion: 1 },
    nodes: [
      { id: vco, typeId: "VCO", params: { ...createDefaultParamsForType("VCO"), wave: "square", pulseWidth: 0.35 } },
      { id: lfo, typeId: "LFO", params: { ...createDefaultParamsForType("LFO"), freqHz: 5, bipolar: true } },
      {
        id: env,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0.06, decay: 0.2, sustain: 0.7, release: 0.4 }
      },
      { id: vcf, typeId: "VCF", params: { ...createDefaultParamsForType("VCF"), cutoffHz: 900, resonance: 0.2 } },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 1, bias: 0 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: env, portId: "gate" } },
      { id: "c3", from: { nodeId: lfo, portId: "out" }, to: { nodeId: vco, portId: "fm" } },
      { id: "c4", from: { nodeId: vco, portId: "out" }, to: { nodeId: vcf, portId: "in" } },
      { id: "c5", from: { nodeId: env, portId: "out" }, to: { nodeId: vcf, portId: "cutoffCV" } },
      { id: "c6", from: { nodeId: vcf, portId: "out" }, to: { nodeId: vca, portId: "in" } },
      { id: "c7", from: { nodeId: env, portId: "out" }, to: { nodeId: vca, portId: "gainCV" } },
      { id: "c8", from: { nodeId: vca, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_bite",
          name: "Bite",
          defaultNormalized: 0.18,
          bindings: [{ id: "b1", nodeId: vcf, paramId: "resonance", map: "linear", min: 0.05, max: 0.9 }]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vco, x: 2, y: 4 },
        { nodeId: lfo, x: 2, y: 9 },
        { nodeId: env, x: 7, y: 9 },
        { nodeId: vcf, x: 7, y: 4 },
        { nodeId: vca, x: 12, y: 4 },
        { nodeId: out, x: 16, y: 4 }
      ]
    },
    io: { audioOutNodeId: out, audioOutPortId: "in" }
  };
};

export const drumPatch = (): Patch => {
  const vco = "vco1";
  const noise = "noise1";
  const bodyEnv = "env1";
  const noiseEnv = "env2";
  const noiseFilter = "vcf1";
  const bodyVca = "vca1";
  const noiseVca = "vca2";
  const mix = "mix1";
  const sat = "sat1";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_drumish",
    name: "Drum-ish",
    meta: { source: "preset", presetId: "preset_drumish", presetVersion: 5 },
    nodes: [
      {
        id: vco,
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "sine", baseTuneCents: -2200, fineTuneCents: -4 }
      },
      { id: noise, typeId: "Noise", params: { ...createDefaultParamsForType("Noise"), color: "white", gain: 1 } },
      {
        id: bodyEnv,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0, decay: 0.06, sustain: 0, release: 0.04 }
      },
      {
        id: noiseEnv,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0, decay: 0.06, sustain: 0, release: 0.04 }
      },
      {
        id: noiseFilter,
        typeId: "VCF",
        params: { ...createDefaultParamsForType("VCF"), type: "bandpass", cutoffHz: 4200, resonance: 0.62, cutoffModAmountOct: 0.25 }
      },
      { id: bodyVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 0.34, bias: 0 } },
      { id: noiseVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 0.82, bias: 0 } },
      { id: mix, typeId: "Mixer4", params: { ...createDefaultParamsForType("Mixer4"), gain1: 0.62, gain2: 0.92 } },
      { id: sat, typeId: "Overdrive", params: { ...createDefaultParamsForType("Overdrive"), gainDb: 6, mix: 0.14 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: bodyEnv, portId: "gate" } },
      { id: "c3", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: noiseEnv, portId: "gate" } },
      { id: "c4", from: { nodeId: vco, portId: "out" }, to: { nodeId: bodyVca, portId: "in" } },
      { id: "c5", from: { nodeId: bodyEnv, portId: "out" }, to: { nodeId: bodyVca, portId: "gainCV" } },
      { id: "c6", from: { nodeId: noise, portId: "out" }, to: { nodeId: noiseFilter, portId: "in" } },
      { id: "c7", from: { nodeId: noiseEnv, portId: "out" }, to: { nodeId: noiseFilter, portId: "cutoffCV" } },
      { id: "c8", from: { nodeId: noiseFilter, portId: "out" }, to: { nodeId: noiseVca, portId: "in" } },
      { id: "c9", from: { nodeId: noiseEnv, portId: "out" }, to: { nodeId: noiseVca, portId: "gainCV" } },
      { id: "c10", from: { nodeId: bodyVca, portId: "out" }, to: { nodeId: mix, portId: "in1" } },
      { id: "c11", from: { nodeId: noiseVca, portId: "out" }, to: { nodeId: mix, portId: "in2" } },
      { id: "c12", from: { nodeId: mix, portId: "out" }, to: { nodeId: sat, portId: "in" } },
      { id: "c13", from: { nodeId: sat, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_shell",
          name: "Shell",
          defaultNormalized: 0.34,
          bindings: [
            { id: "b1", nodeId: bodyEnv, paramId: "decay", map: "linear", min: 0.03, max: 0.24 },
            { id: "b2", nodeId: bodyEnv, paramId: "release", map: "linear", min: 0.015, max: 0.16 },
            { id: "b3", nodeId: bodyVca, paramId: "gain", map: "linear", min: 0.38, max: 0.82 }
          ]
        },
        {
          id: "macro_shell_level",
          name: "Shell Level",
          defaultNormalized: 0.46,
          bindings: [
            { id: "b10", nodeId: mix, paramId: "gain1", map: "linear", min: 0.18, max: 1 },
            { id: "b12", nodeId: bodyVca, paramId: "gain", map: "linear", min: 0.12, max: 0.9 }
          ]
        },
        {
          id: "macro_rattle",
          name: "Rattle",
          defaultNormalized: 0.46,
          bindings: [
            { id: "b4", nodeId: noiseVca, paramId: "gain", map: "linear", min: 0.08, max: 0.95 },
            { id: "b5", nodeId: noiseEnv, paramId: "decay", map: "linear", min: 0.03, max: 0.22 },
            { id: "b6", nodeId: noiseEnv, paramId: "release", map: "linear", min: 0.01, max: 0.18 },
            { id: "b7", nodeId: noiseFilter, paramId: "cutoffHz", map: "exp", min: 2400, max: 4800 },
            { id: "b8", nodeId: noiseFilter, paramId: "resonance", map: "linear", min: 0.28, max: 0.58 },
            { id: "b9", nodeId: sat, paramId: "mix", map: "linear", min: 0.04, max: 0.18 }
          ]
        },
        {
          id: "macro_rattle_level",
          name: "Rattle Level",
          defaultNormalized: 0.5,
          bindings: [
            { id: "b11", nodeId: mix, paramId: "gain2", map: "linear", min: 0, max: 1 },
            { id: "b13", nodeId: noiseVca, paramId: "gain", map: "linear", min: 0, max: 0.95 }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vco, x: 2, y: 2 },
        { nodeId: noise, x: 2, y: 7 },
        { nodeId: bodyEnv, x: 7, y: 2 },
        { nodeId: noiseEnv, x: 7, y: 8 },
        { nodeId: noiseFilter, x: 12, y: 8 },
        { nodeId: bodyVca, x: 12, y: 2 },
        { nodeId: noiseVca, x: 17, y: 8 },
        { nodeId: mix, x: 17, y: 4 },
        { nodeId: sat, x: 21, y: 4 },
        { nodeId: out, x: 25, y: 4 }
      ]
    },
    io: { audioOutNodeId: out, audioOutPortId: "in" }
  };
};

export const presetPatches = [bassPatch(), brassPatch(), keysPatch(), padPatch(), pluckPatch(), drumPatch()];

const defaultTrackFx = () => ({
  delayEnabled: false,
  reverbEnabled: false,
  saturationEnabled: false,
  compressorEnabled: false,
  delayMix: 0.2,
  reverbMix: 0.2,
  drive: 0.2,
  compression: 0.4
});

const makeTrack = (name: string, instrumentPatchId: string, notes: Track["notes"]): Track => ({
  id: createId("track"),
  name,
  instrumentPatchId,
  notes,
  macroValues: {},
  macroPanelExpanded: true,
  fx: defaultTrackFx()
});

export const createDefaultProject = (): Project => {
  const now = Date.now();

  return {
    id: "project_default",
    name: "New Synth Playground Project",
    global: {
      sampleRate: 48000,
      tempo: 122,
      meter: "4/4",
      gridBeats: 0.25,
      loop: {
        startBeat: 0,
        endBeat: 8,
        enabled: false
      }
    },
    tracks: [
      makeTrack("Bass", "preset_bass", [
        { id: createId("note"), pitchStr: "C2", startBeat: 0, durationBeats: 1, velocity: 0.92 },
        { id: createId("note"), pitchStr: "C2", startBeat: 1.5, durationBeats: 0.5, velocity: 0.88 },
        { id: createId("note"), pitchStr: "G1", startBeat: 2, durationBeats: 1, velocity: 0.89 },
        { id: createId("note"), pitchStr: "A#1", startBeat: 3, durationBeats: 1, velocity: 0.85 },
        { id: createId("note"), pitchStr: "C2", startBeat: 4, durationBeats: 1, velocity: 0.9 }
      ]),
      makeTrack("Pad", "preset_pad", [
        { id: createId("note"), pitchStr: "C4", startBeat: 0, durationBeats: 2, velocity: 0.8 },
        { id: createId("note"), pitchStr: "G4", startBeat: 2, durationBeats: 2, velocity: 0.8 },
        { id: createId("note"), pitchStr: "A#4", startBeat: 4, durationBeats: 2, velocity: 0.78 }
      ]),
      makeTrack("Pluck", "preset_pluck", [
        { id: createId("note"), pitchStr: "C5", startBeat: 0, durationBeats: 0.25, velocity: 0.9 },
        { id: createId("note"), pitchStr: "D5", startBeat: 0.5, durationBeats: 0.25, velocity: 0.85 },
        { id: createId("note"), pitchStr: "G4", startBeat: 1, durationBeats: 0.25, velocity: 0.85 },
        { id: createId("note"), pitchStr: "A4", startBeat: 1.5, durationBeats: 0.25, velocity: 0.88 }
      ])
    ],
    patches: presetPatches,
    masterFx: {
      compressorEnabled: false,
      limiterEnabled: true,
      makeupGain: 0
    },
    createdAt: now,
    updatedAt: now
  };
};
