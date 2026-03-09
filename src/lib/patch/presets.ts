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
    meta: { source: "preset" },
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
  const vca = "vca1";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_pad",
    name: "Pad",
    meta: { source: "preset" },
    nodes: [
      {
        id: vco1,
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "triangle", fineTuneCents: -4 }
      },
      {
        id: vco2,
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "saw", fineTuneCents: 4 }
      },
      { id: lfo, typeId: "LFO", params: { ...createDefaultParamsForType("LFO"), freqHz: 0.3 } },
      { id: mix, typeId: "Mixer4", params: { ...createDefaultParamsForType("Mixer4"), gain1: 0.5, gain2: 0.5 } },
      {
        id: env,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0.8,
          decay: 0.5,
          sustain: 0.75,
          release: 1.8
        }
      },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), bias: 0, gain: 1 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco1, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco2, portId: "pitch" } },
      { id: "c3", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: env, portId: "gate" } },
      { id: "c4", from: { nodeId: lfo, portId: "out" }, to: { nodeId: vco1, portId: "pwm" } },
      { id: "c5", from: { nodeId: vco1, portId: "out" }, to: { nodeId: mix, portId: "in1" } },
      { id: "c6", from: { nodeId: vco2, portId: "out" }, to: { nodeId: mix, portId: "in2" } },
      { id: "c7", from: { nodeId: mix, portId: "out" }, to: { nodeId: vca, portId: "in" } },
      { id: "c8", from: { nodeId: env, portId: "out" }, to: { nodeId: vca, portId: "gainCV" } },
      { id: "c9", from: { nodeId: vca, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_attack",
          name: "Attack",
          defaultNormalized: 0.28,
          bindings: [{ id: "b1", nodeId: env, paramId: "attack", map: "linear", min: 0.02, max: 2.8 }]
        },
        {
          id: "macro_motion",
          name: "Motion",
          defaultNormalized: 0.39,
          bindings: [{ id: "b2", nodeId: lfo, paramId: "freqHz", map: "exp", min: 0.05, max: 8 }]
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
        { nodeId: vca, x: 11, y: 4 },
        { nodeId: out, x: 15, y: 4 }
      ]
    },
    io: { audioOutNodeId: out, audioOutPortId: "in" }
  };
};

export const pluckPatch = (): Patch => {
  const noise = "noise1";
  const env = "env1";
  const vca = "vca1";
  const filter = "vcf1";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_pluck",
    name: "Pluck",
    meta: { source: "preset" },
    nodes: [
      { id: noise, typeId: "Noise", params: { ...createDefaultParamsForType("Noise"), gain: 0.65 } },
      {
        id: env,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 0.16,
          sustain: 0,
          release: 0.12
        }
      },
      { id: filter, typeId: "VCF", params: { ...createDefaultParamsForType("VCF"), cutoffHz: 1400, resonance: 0.4 } },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), bias: 0, gain: 1 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: env, portId: "gate" } },
      { id: "c2", from: { nodeId: noise, portId: "out" }, to: { nodeId: filter, portId: "in" } },
      { id: "c3", from: { nodeId: env, portId: "out" }, to: { nodeId: vca, portId: "gainCV" } },
      { id: "c4", from: { nodeId: filter, portId: "out" }, to: { nodeId: vca, portId: "in" } },
      { id: "c5", from: { nodeId: env, portId: "out" }, to: { nodeId: filter, portId: "cutoffCV" } },
      { id: "c6", from: { nodeId: vca, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_tone",
          name: "Tone",
          defaultNormalized: 0.47,
          bindings: [{ id: "b1", nodeId: filter, paramId: "cutoffHz", map: "exp", min: 250, max: 8000 }]
        },
        {
          id: "macro_decay",
          name: "Decay",
          defaultNormalized: 0.15,
          bindings: [{ id: "b2", nodeId: env, paramId: "decay", map: "linear", min: 0.05, max: 0.8 }]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: noise, x: 2, y: 4 },
        { nodeId: env, x: 2, y: 9 },
        { nodeId: filter, x: 7, y: 4 },
        { nodeId: vca, x: 12, y: 4 },
        { nodeId: out, x: 16, y: 4 }
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
    meta: { source: "preset" },
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
    meta: { source: "preset" },
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
  const noise = "noise1";
  const env = "env1";
  const vca = "vca1";
  const sat = "sat1";
  const out = "out1";

  return {
    schemaVersion: 1,
    id: "preset_drum",
    name: "Drum-ish",
    meta: { source: "preset" },
    nodes: [
      { id: noise, typeId: "Noise", params: { ...createDefaultParamsForType("Noise"), color: "white", gain: 0.9 } },
      {
        id: env,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0, decay: 0.08, sustain: 0, release: 0.05 }
      },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 1, bias: 0 } },
      { id: sat, typeId: "Overdrive", params: { ...createDefaultParamsForType("Overdrive"), gainDb: 24, mix: 0.6 } },
      outputNode(out)
    ],
    connections: [
      { id: "c1", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: env, portId: "gate" } },
      { id: "c2", from: { nodeId: noise, portId: "out" }, to: { nodeId: vca, portId: "in" } },
      { id: "c3", from: { nodeId: env, portId: "out" }, to: { nodeId: vca, portId: "gainCV" } },
      { id: "c4", from: { nodeId: vca, portId: "out" }, to: { nodeId: sat, portId: "in" } },
      { id: "c5", from: { nodeId: sat, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_body",
          name: "Body",
          defaultNormalized: 0.5,
          bindings: [{ id: "b1", nodeId: sat, paramId: "mix", map: "linear", min: 0.2, max: 1 }]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: noise, x: 2, y: 4 },
        { nodeId: env, x: 2, y: 9 },
        { nodeId: vca, x: 8, y: 4 },
        { nodeId: sat, x: 12, y: 4 },
        { nodeId: out, x: 16, y: 4 }
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
