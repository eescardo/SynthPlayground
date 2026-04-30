import { createDefaultParamsForType } from "@/lib/patch/moduleRegistry";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { createDefaultProjectFromTemplate, createEmptyProjectFromPresets } from "@/lib/defaultProjectTemplate";
import { createId } from "@/lib/ids";
import { normalizeMacroBindingIds } from "@/lib/patch/macroBindings";
import { createPatchOutputPort } from "@/lib/patch/ports";
import { CURRENT_PATCH_SCHEMA_VERSION } from "@/lib/patch/schemaVersion";
import { Project } from "@/types/music";
import { Patch, PatchMeta } from "@/types/patch";

const noteCore = {
  pitch: HOST_PORT_IDS.pitch,
  gate: HOST_PORT_IDS.gate,
  velocity: HOST_PORT_IDS.velocity,
  mod: HOST_PORT_IDS.modWheel
};

export const createClearPatch = ({
  id,
  name = "New Patch",
  meta = { source: "custom" } satisfies PatchMeta,
  canvasZoom
}: {
  id: string;
  name?: string;
  meta?: PatchMeta;
  canvasZoom?: number;
}): Patch => ({
  schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
  id,
  name,
  meta,
  nodes: [],
  ports: [createPatchOutputPort()],
  connections: [],
  ui: {
    macros: [],
    canvasZoom
  },
  layout: {
    nodes: []
  }
});

export const bassPatch = (): Patch => {
  const patchId = "preset_bass";
  const pitchTrackId = "cvscale1";
  const subTransposeId = "cvtranspose1";
  const cutoffMixId = "cvmix1";
  const mainVcoId = "vco1";
  const subVcoId = "vco2";
  const envId = "env1";
  const filterEnvId = "env2";
  const mixId = "mix1";
  const vcaId = "vca1";
  const vcfId = "vcf1";
  const satId = "sat1";
  const outId = "output";

  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: patchId,
    name: "Bass",
    meta: { source: "preset", presetId: "preset_bass", presetVersion: 14 },
    nodes: [
      {
        id: pitchTrackId,
        typeId: "CVScaler",
        params: {
          ...createDefaultParamsForType("CVScaler"),
          scale: 0.32
        }
      },
      {
        id: subTransposeId,
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: -1
        }
      },
      {
        id: cutoffMixId,
        typeId: "CVMixer2",
        params: {
          ...createDefaultParamsForType("CVMixer2"),
          gain1: 1,
          gain2: 1
        }
      },
      {
        id: mainVcoId,
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "saw",
          fineTuneCents: -4
        }
      },
      {
        id: subVcoId,
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "square",
          pulseWidth: 0.42,
          fineTuneCents: 2
        }
      },
      {
        id: envId,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 10,
          decay: 220,
          sustain: 0.52,
          release: 260
        }
      },
      {
        id: filterEnvId,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 4,
          decay: 80,
          sustain: 0,
          release: 20
        }
      },
      {
        id: mixId,
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0,
          gain2: 0.74
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
          cutoffHz: 320,
          resonance: 0.78,
          cutoffModAmountOct: 1.8
        }
      },
      {
        id: satId,
        typeId: "Saturation",
        params: {
          ...createDefaultParamsForType("Saturation"),
          driveDb: 5,
          mix: 0.22,
          type: "tanh"
        }
      }
    ],
    ports: [createPatchOutputPort()],
    connections: [
      {
        id: "c1",
        from: { nodeId: noteCore.pitch, portId: "out" },
        to: { nodeId: mainVcoId, portId: "pitch" }
      },
      {
        id: "c2",
        from: { nodeId: noteCore.pitch, portId: "out" },
        to: { nodeId: subTransposeId, portId: "in" }
      },
      {
        id: "c3",
        from: { nodeId: subTransposeId, portId: "out" },
        to: { nodeId: subVcoId, portId: "pitch" }
      },
      {
        id: "c4",
        from: { nodeId: noteCore.pitch, portId: "out" },
        to: { nodeId: pitchTrackId, portId: "in" }
      },
      {
        id: "c5",
        from: { nodeId: noteCore.gate, portId: "out" },
        to: { nodeId: envId, portId: "gate" }
      },
      {
        id: "c5a",
        from: { nodeId: noteCore.gate, portId: "out" },
        to: { nodeId: filterEnvId, portId: "gate" }
      },
      {
        id: "c6",
        from: { nodeId: mainVcoId, portId: "out" },
        to: { nodeId: mixId, portId: "in1" }
      },
      {
        id: "c7",
        from: { nodeId: subVcoId, portId: "out" },
        to: { nodeId: mixId, portId: "in2" }
      },
      {
        id: "c8",
        from: { nodeId: mixId, portId: "out" },
        to: { nodeId: vcfId, portId: "in" }
      },
      {
        id: "c9",
        from: { nodeId: pitchTrackId, portId: "out" },
        to: { nodeId: cutoffMixId, portId: "in1" }
      },
      {
        id: "c9a",
        from: { nodeId: filterEnvId, portId: "out" },
        to: { nodeId: cutoffMixId, portId: "in2" }
      },
      {
        id: "c9b",
        from: { nodeId: cutoffMixId, portId: "out" },
        to: { nodeId: vcfId, portId: "cutoffCV" }
      },
      {
        id: "c10",
        from: { nodeId: envId, portId: "out" },
        to: { nodeId: vcaId, portId: "gainCV" }
      },
      {
        id: "c11",
        from: { nodeId: vcfId, portId: "out" },
        to: { nodeId: vcaId, portId: "in" }
      },
      {
        id: "c12",
        from: { nodeId: vcaId, portId: "out" },
        to: { nodeId: satId, portId: "in" }
      },
      {
        id: "c13",
        from: { nodeId: satId, portId: "out" },
        to: { nodeId: outId, portId: "in" }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_cutoff",
          name: "Cutoff",
          keyframeCount: 2,
          defaultNormalized: 0.28,
          bindings: [
            {
              id: "b1",
              nodeId: vcfId,
              paramId: "cutoffHz",
              map: "exp",
              min: 120,
              max: 4200
            }
          ]
        },
        {
          id: "macro_decay",
          name: "Pop/Slap",
          keyframeCount: 3,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "b2",
              nodeId: envId,
              paramId: "attack",
              map: "linear",
              points: [
                { x: 0, y: 3.2 },
                { x: 0.5, y: 7.5 },
                { x: 1, y: 3.5 }
              ]
            },
            {
              id: "b3",
              nodeId: envId,
              paramId: "decay",
              map: "linear",
              points: [
                { x: 0, y: 3.5 },
                { x: 0.5, y: 140 },
                { x: 1, y: 32 }
              ]
            },
            {
              id: "b4",
              nodeId: envId,
              paramId: "sustain",
              map: "linear",
              points: [
                { x: 0, y: 0.48 },
                { x: 0.5, y: 0.72 },
                { x: 1, y: 0.32 }
              ]
            },
            {
              id: "b5",
              nodeId: envId,
              paramId: "release",
              map: "linear",
              points: [
                { x: 0, y: 3 },
                { x: 0.5, y: 28 },
                { x: 1, y: 12 }
              ]
            },
            {
              id: "b6",
              nodeId: mixId,
              paramId: "gain1",
              map: "linear",
              points: [
                { x: 0, y: 0.5 },
                { x: 0.5, y: 0 },
                { x: 1, y: 0.66 }
              ]
            },
            {
              id: "b7",
              nodeId: mixId,
              paramId: "gain2",
              map: "linear",
              points: [
                { x: 0, y: 0.66 },
                { x: 0.5, y: 0.92 },
                { x: 1, y: 0.34 }
              ]
            },
            {
              id: "b8",
              nodeId: filterEnvId,
              paramId: "attack",
              map: "linear",
              points: [
                { x: 0, y: 2 },
                { x: 0.5, y: 4 },
                { x: 1, y: 2.5 }
              ]
            },
            {
              id: "b9",
              nodeId: filterEnvId,
              paramId: "decay",
              map: "linear",
              points: [
                { x: 0, y: 20 },
                { x: 0.5, y: 110 },
                { x: 1, y: 240 }
              ]
            },
            {
              id: "b10",
              nodeId: cutoffMixId,
              paramId: "gain2",
              map: "linear",
              points: [
                { x: 0, y: 0.18 },
                { x: 0.5, y: 0.52 },
                { x: 1, y: 1.15 }
              ]
            },
            {
              id: "b11",
              nodeId: vcfId,
              paramId: "cutoffModAmountOct",
              map: "linear",
              points: [
                { x: 0, y: 0.38 },
                { x: 0.5, y: 1.9 },
                { x: 1, y: 3.4 }
              ]
            },
            {
              id: "b12",
              nodeId: vcfId,
              paramId: "resonance",
              map: "linear",
              points: [
                { x: 0, y: 0.94 },
                { x: 0.5, y: 0.84 },
                { x: 1, y: 0.72 }
              ]
            },
            {
              id: "b13",
              nodeId: satId,
              paramId: "driveDb",
              map: "linear",
              points: [
                { x: 0, y: 2.5 },
                { x: 0.5, y: 2.2 },
                { x: 1, y: 10.5 }
              ]
            },
            {
              id: "b14",
              nodeId: satId,
              paramId: "mix",
              map: "linear",
              points: [
                { x: 0, y: 0.12 },
                { x: 0.5, y: 0.06 },
                { x: 1, y: 0.34 }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: pitchTrackId, x: 2, y: 2 },
        { nodeId: subTransposeId, x: 2, y: 6 },
        { nodeId: cutoffMixId, x: 6, y: 10 },
        { nodeId: mainVcoId, x: 6, y: 1 },
        { nodeId: subVcoId, x: 6, y: 5 },
        { nodeId: envId, x: 10, y: 9 },
        { nodeId: filterEnvId, x: 10, y: 13 },
        { nodeId: mixId, x: 14, y: 3 },
        { nodeId: vcfId, x: 18, y: 3 },
        { nodeId: vcaId, x: 22, y: 3 },
        { nodeId: satId, x: 26, y: 3 }
      ]
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
  const out = "output";

  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_pad",
    name: "Pad",
    meta: { source: "preset", presetId: "preset_pad", presetVersion: 7 },
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
          attack: 1100,
          decay: 900,
          sustain: 0.78,
          release: 1200
        }
      },
      {
        id: vcf,
        typeId: "VCF",
        params: { ...createDefaultParamsForType("VCF"), cutoffHz: 1450, resonance: 0.84, cutoffModAmountOct: 1.6 }
      },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), bias: 0, gain: 1 } }
    ],
    ports: [createPatchOutputPort()],
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
          keyframeCount: 2,
          defaultNormalized: 0.34,
          bindings: [{ id: "b1", nodeId: env, paramId: "attack", map: "linear", min: 50, max: 3200 }]
        },
        {
          id: "macro_release",
          name: "Release",
          keyframeCount: 2,
          defaultNormalized: 0.32,
          bindings: [{ id: "b6", nodeId: env, paramId: "release", map: "linear", min: 150, max: 2400 }]
        },
        {
          id: "macro_motion",
          name: "Motion",
          keyframeCount: 2,
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
        { nodeId: vca, x: 15, y: 4 }
      ]
    }
  };
};

export const pluckPatch = (): Patch => {
  const string = "karplus1";
  const bodyTranspose = "cvtranspose1";
  const bodyString = "karplus2";
  const warmthString = "karplus3";
  const shimmerString = "karplus4";
  const ampEnv = "env1";
  const mix = "mix1";
  const filter = "vcf1";
  const ampVca = "vca2";
  const out = "output";

  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_pluck",
    name: "Pluck",
    meta: { source: "preset", presetId: "preset_pluck", presetVersion: 29 },
    nodes: [
      {
        id: string,
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.996,
          damping: 0.42,
          brightness: 0.46,
          excitation: "noise"
        }
      },
      {
        id: bodyTranspose,
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: -1,
          semitones: 0,
          cents: 3
        }
      },
      {
        id: bodyString,
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.997,
          damping: 0.62,
          brightness: 0.18,
          excitation: "noise"
        }
      },
      {
        id: warmthString,
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.9983,
          damping: 0.74,
          brightness: 0.08,
          excitation: "noise"
        }
      },
      {
        id: shimmerString,
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.9976,
          damping: 0.66,
          brightness: 0.16,
          excitation: "noise"
        }
      },
      {
        id: ampEnv,
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 40,
          sustain: 1,
          release: 320
        }
      },
      {
        id: mix,
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.98,
          gain2: 0.24,
          gain3: 0,
          gain4: 0
        }
      },
      {
        id: filter,
        typeId: "VCF",
        params: { ...createDefaultParamsForType("VCF"), cutoffHz: 980, resonance: 0.94, cutoffModAmountOct: 0.45 }
      },
      { id: ampVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), bias: 0, gain: 1 } }
    ],
    ports: [createPatchOutputPort()],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: string, portId: "pitch" } },
      { id: "c1b", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: bodyTranspose, portId: "in" } },
      { id: "c1c", from: { nodeId: bodyTranspose, portId: "out" }, to: { nodeId: bodyString, portId: "pitch" } },
      { id: "c1d", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: warmthString, portId: "pitch" } },
      { id: "c1e", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: shimmerString, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: ampEnv, portId: "gate" } },
      { id: "c5a", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: string, portId: "gate" } },
      { id: "c5b", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: bodyString, portId: "gate" } },
      { id: "c5c", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: warmthString, portId: "gate" } },
      { id: "c5d", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: shimmerString, portId: "gate" } },
      { id: "c7", from: { nodeId: string, portId: "out" }, to: { nodeId: mix, portId: "in1" } },
      { id: "c7b", from: { nodeId: bodyString, portId: "out" }, to: { nodeId: mix, portId: "in2" } },
      { id: "c7c", from: { nodeId: warmthString, portId: "out" }, to: { nodeId: mix, portId: "in3" } },
      { id: "c7d", from: { nodeId: shimmerString, portId: "out" }, to: { nodeId: mix, portId: "in4" } },
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
          name: "Tightness",
          keyframeCount: 3,
          defaultNormalized: 0.58,
          bindings: [
            {
              id: "b1",
              nodeId: filter,
              paramId: "cutoffHz",
              map: "linear",
              points: [
                { x: 0, y: 620 },
                { x: 0.5, y: 1269.645569 },
                { x: 1, y: 2600 }
              ]
            },
            {
              id: "b1b",
              nodeId: string,
              paramId: "damping",
              map: "linear",
              points: [
                { x: 0, y: 0.62 },
                { x: 0.5, y: 0.492 },
                { x: 1, y: 0.2 }
              ]
            },
            {
              id: "b1ba",
              nodeId: bodyString,
              paramId: "damping",
              map: "linear",
              points: [
                { x: 0, y: 0.68 },
                { x: 0.5, y: 0.6 },
                { x: 1, y: 0.34 }
              ]
            },
            {
              id: "b1bb",
              nodeId: warmthString,
              paramId: "damping",
              map: "linear",
              points: [
                { x: 0, y: 0.76 },
                { x: 0.5, y: 0.744 },
                { x: 1, y: 0.5 }
              ]
            },
            {
              id: "b1bc",
              nodeId: shimmerString,
              paramId: "damping",
              map: "linear",
              points: [
                { x: 0, y: 0.74 },
                { x: 0.5, y: 0.692 },
                { x: 1, y: 0.42 }
              ]
            },
            {
              id: "b1c",
              nodeId: filter,
              paramId: "cutoffModAmountOct",
              map: "linear",
              points: [
                { x: 0, y: 0.2 },
                { x: 0.5, y: 0.344 },
                { x: 1, y: 0.82 }
              ]
            },
            {
              id: "b1d",
              nodeId: ampVca,
              paramId: "gain",
              map: "linear",
              points: [
                { x: 0, y: 2.8 },
                { x: 0.5, y: 1.376 },
                { x: 1, y: 1.14 }
              ]
            }
          ]
        },
        {
          id: "macro_decay",
          name: "Decay",
          keyframeCount: 2,
          defaultNormalized: 0.62,
          bindings: [
            { id: "b2", nodeId: string, paramId: "decay", map: "linear", min: 0.97, max: 0.9985 },
            { id: "b2b", nodeId: bodyString, paramId: "decay", map: "linear", min: 0.982, max: 0.9992 },
            { id: "b2c", nodeId: warmthString, paramId: "decay", map: "linear", min: 0.992, max: 0.9996 },
            { id: "b2d", nodeId: shimmerString, paramId: "decay", map: "linear", min: 0.988, max: 0.9993 },
            { id: "b3", nodeId: ampEnv, paramId: "release", map: "linear", min: 180, max: 720 }
          ]
        },
        {
          id: "macro_material",
          name: "Material",
          keyframeCount: 3,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "b6",
              nodeId: string,
              paramId: "brightness",
              map: "linear",
              points: [
                { x: 0, y: 1 },
                { x: 0.5, y: 0.22 },
                { x: 1, y: 0.772 }
              ]
            },
            {
              id: "b7",
              nodeId: bodyString,
              paramId: "brightness",
              map: "linear",
              points: [
                { x: 0, y: 0.03 },
                { x: 0.5, y: 0.18 },
                { x: 1, y: 0.468 }
              ]
            },
            {
              id: "b7b",
              nodeId: warmthString,
              paramId: "brightness",
              map: "linear",
              points: [
                { x: 0, y: 0.03 },
                { x: 0.5, y: 0.06 },
                { x: 1, y: 0.18 }
              ]
            },
            {
              id: "b7c",
              nodeId: shimmerString,
              paramId: "brightness",
              map: "linear",
              points: [
                { x: 0, y: 0.02 },
                { x: 0.5, y: 0.08 },
                { x: 1, y: 0.28 }
              ]
            },
            {
              id: "b8",
              nodeId: filter,
              paramId: "resonance",
              map: "linear",
              points: [
                { x: 0, y: 0.695 },
                { x: 0.5, y: 0.95 },
                { x: 1, y: 0.878 }
              ]
            },
            {
              id: "b8b",
              nodeId: mix,
              paramId: "gain1",
              map: "linear",
              points: [
                { x: 0, y: 1.27 },
                { x: 0.5, y: 0.88 },
                { x: 1, y: 0.688 }
              ]
            },
            {
              id: "b8c",
              nodeId: mix,
              paramId: "gain2",
              map: "linear",
              points: [
                { x: 0, y: 0 },
                { x: 0.5, y: 0.22 },
                { x: 1, y: 1 }
              ]
            },
            {
              id: "b8d",
              nodeId: mix,
              paramId: "gain3",
              map: "linear",
              points: [
                { x: 0, y: 0 },
                { x: 0.5, y: 0.08 },
                { x: 1, y: 0.8 }
              ]
            },
            {
              id: "b8e",
              nodeId: mix,
              paramId: "gain4",
              map: "linear",
              points: [
                { x: 0, y: 0 },
                { x: 0.5, y: 0.02 },
                { x: 1, y: 0.28 }
              ]
            },
            {
              id: "b9",
              nodeId: ampEnv,
              paramId: "decay",
              map: "linear",
              points: [
                { x: 0, y: 2.5 },
                { x: 0.5, y: 40 },
                { x: 1, y: 106 }
              ]
            },
            {
              id: "b10",
              nodeId: ampEnv,
              paramId: "sustain",
              map: "linear",
              points: [
                { x: 0, y: 0.85 },
                { x: 0.5, y: 1 },
                { x: 1, y: 1 }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: string, x: 2, y: 3 },
        { nodeId: bodyTranspose, x: 2, y: 8 },
        { nodeId: bodyString, x: 6, y: 8 },
        { nodeId: warmthString, x: 2, y: 18 },
        { nodeId: shimmerString, x: 6, y: 18 },
        { nodeId: ampEnv, x: 2, y: 13 },
        { nodeId: mix, x: 7, y: 5 },
        { nodeId: filter, x: 11, y: 5 },
        { nodeId: ampVca, x: 15, y: 5 }
      ]
    }
  };
};

export const keysPatch = (): Patch => {
  const vco = "vco1";
  const env = "env1";
  const vca = "vca1";
  const sat = "sat1";
  const out = "output";

  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_keys",
    name: "Simple Piano-ish",
    meta: { source: "preset", presetId: "preset_keys", presetVersion: 3 },
    nodes: [
      { id: vco, typeId: "VCO", params: { ...createDefaultParamsForType("VCO"), wave: "triangle" } },
      {
        id: env,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 1, decay: 250, sustain: 0.1, release: 300 }
      },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 1, bias: 0 } },
      { id: sat, typeId: "Saturation", params: { ...createDefaultParamsForType("Saturation"), driveDb: 6, mix: 0.25 } }
    ],
    ports: [createPatchOutputPort()],
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
          keyframeCount: 2,
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
        { nodeId: sat, x: 12, y: 4 }
      ]
    }
  };
};

export const brassPatch = (): Patch => {
  const vco = "vco1";
  const lfo = "lfo1";
  const env = "env1";
  const vcf = "vcf1";
  const vca = "vca1";
  const out = "output";

  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_brass",
    name: "Brass-ish",
    meta: { source: "preset", presetId: "preset_brass", presetVersion: 4 },
    nodes: [
      { id: vco, typeId: "VCO", params: { ...createDefaultParamsForType("VCO"), wave: "square", pulseWidth: 0.35 } },
      { id: lfo, typeId: "LFO", params: { ...createDefaultParamsForType("LFO"), freqHz: 5, bipolar: true } },
      {
        id: env,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 60, decay: 200, sustain: 0.7, release: 400 }
      },
      { id: vcf, typeId: "VCF", params: { ...createDefaultParamsForType("VCF"), cutoffHz: 900, resonance: 0.8 } },
      { id: vca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 1, bias: 0 } }
    ],
    ports: [createPatchOutputPort()],
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
          keyframeCount: 2,
          defaultNormalized: 0.18,
          bindings: [{ id: "b1", nodeId: vcf, paramId: "resonance", map: "linear", min: 0.95, max: 0.1 }]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vco, x: 2, y: 4 },
        { nodeId: lfo, x: 2, y: 9 },
        { nodeId: env, x: 7, y: 9 },
        { nodeId: vcf, x: 7, y: 4 },
        { nodeId: vca, x: 12, y: 4 }
      ]
    }
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
  const out = "output";

  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_drumish",
    name: "Drum-ish",
    meta: { source: "preset", presetId: "preset_drumish", presetVersion: 11 },
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
        params: { ...createDefaultParamsForType("ADSR"), attack: 0, decay: 60, sustain: 0, release: 40 }
      },
      {
        id: noiseEnv,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0, decay: 60, sustain: 0, release: 40 }
      },
      {
        id: noiseFilter,
        typeId: "VCF",
        params: { ...createDefaultParamsForType("VCF"), type: "bandpass", cutoffHz: 4200, resonance: 0.38, cutoffModAmountOct: 0.25 }
      },
      { id: bodyVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 0.34, bias: 0 } },
      { id: noiseVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 0.82, bias: 0 } },
      { id: mix, typeId: "Mixer4", params: { ...createDefaultParamsForType("Mixer4"), gain1: 0.62, gain2: 0.92 } },
      { id: sat, typeId: "Overdrive", params: { ...createDefaultParamsForType("Overdrive"), gainDb: 6, mix: 0.14 } }
    ],
    ports: [createPatchOutputPort()],
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
          keyframeCount: 2,
          defaultNormalized: 0.34,
          bindings: [
            { id: "b1", nodeId: bodyEnv, paramId: "decay", map: "linear", min: 30, max: 240 },
            { id: "b2", nodeId: bodyEnv, paramId: "release", map: "linear", min: 15, max: 160 },
            { id: "b3", nodeId: bodyVca, paramId: "gain", map: "linear", min: 0.38, max: 0.82 }
          ]
        },
        {
          id: "macro_shell_level",
          name: "Shell Level",
          keyframeCount: 2,
          defaultNormalized: 0.46,
          bindings: [{ id: "b10", nodeId: mix, paramId: "gain1", map: "linear", min: 0.18, max: 1 }]
        },
        {
          id: "macro_rattle",
          name: "Rattle",
          keyframeCount: 2,
          defaultNormalized: 0.46,
          bindings: [
            { id: "b4", nodeId: noiseVca, paramId: "gain", map: "linear", min: 0.08, max: 0.95 },
            { id: "b5", nodeId: noiseEnv, paramId: "decay", map: "linear", min: 30, max: 220 },
            { id: "b6", nodeId: noiseEnv, paramId: "release", map: "linear", min: 10, max: 180 },
            { id: "b7", nodeId: noiseFilter, paramId: "cutoffHz", map: "exp", min: 2400, max: 4800 },
            { id: "b8", nodeId: noiseFilter, paramId: "resonance", map: "linear", min: 0.72, max: 0.42 },
            { id: "b9", nodeId: sat, paramId: "mix", map: "linear", min: 0.04, max: 0.18 }
          ]
        },
        {
          id: "macro_rattle_level",
          name: "Rattle Level",
          keyframeCount: 2,
          defaultNormalized: 0.5,
          bindings: [{ id: "b11", nodeId: mix, paramId: "gain2", map: "linear", min: 0, max: 1 }]
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
        { nodeId: sat, x: 21, y: 4 }
      ]
    }
  };
};

export const bassDrumPatch = (): Patch => {
  const vco = "vco1";
  const subTranspose = "cvtranspose1";
  const subVco = "vco2";
  const clickNoise = "noise1";
  const bodyEnv = "env1";
  const clickEnv = "env2";
  const clickFilter = "vcf1";
  const bodyMix = "mix0";
  const bodyVca = "vca1";
  const clickVca = "vca2";
  const mix = "mix1";
  const sat = "sat1";
  const out = "output";

  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_bassdrum",
    name: "Bass Drum",
    meta: { source: "preset", presetId: "preset_bassdrum", presetVersion: 12 },
    nodes: [
      {
        id: vco,
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "sine", baseTuneCents: -3000, fineTuneCents: 0 }
      },
      {
        id: subTranspose,
        typeId: "CVTranspose",
        params: { ...createDefaultParamsForType("CVTranspose"), octaves: -1 }
      },
      {
        id: subVco,
        typeId: "VCO",
        params: { ...createDefaultParamsForType("VCO"), wave: "sine", baseTuneCents: -3000, fineTuneCents: 0 }
      },
      { id: clickNoise, typeId: "Noise", params: { ...createDefaultParamsForType("Noise"), color: "white", gain: 1 } },
      {
        id: bodyEnv,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0, decay: 120, sustain: 0, release: 45 }
      },
      {
        id: clickEnv,
        typeId: "ADSR",
        params: { ...createDefaultParamsForType("ADSR"), attack: 0, decay: 15, sustain: 0, release: 12 }
      },
      {
        id: clickFilter,
        typeId: "VCF",
        params: { ...createDefaultParamsForType("VCF"), type: "bandpass", cutoffHz: 3200, resonance: 0.66, cutoffModAmountOct: 0.12 }
      },
      { id: bodyMix, typeId: "Mixer4", params: { ...createDefaultParamsForType("Mixer4"), gain1: 1, gain2: 1, gain3: 0 } },
      { id: bodyVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 1, bias: 0 } },
      { id: clickVca, typeId: "VCA", params: { ...createDefaultParamsForType("VCA"), gain: 0.34, bias: 0 } },
      { id: mix, typeId: "Mixer4", params: { ...createDefaultParamsForType("Mixer4"), gain1: 1, gain2: 0.34, gain3: 0 } },
      { id: sat, typeId: "Overdrive", params: { ...createDefaultParamsForType("Overdrive"), gainDb: 20, mix: 0.34 } }
    ],
    ports: [createPatchOutputPort({ gainDb: 6 })],
    connections: [
      { id: "c1", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: vco, portId: "pitch" } },
      { id: "c1a", from: { nodeId: noteCore.pitch, portId: "out" }, to: { nodeId: subTranspose, portId: "in" } },
      { id: "c1b", from: { nodeId: subTranspose, portId: "out" }, to: { nodeId: subVco, portId: "pitch" } },
      { id: "c2", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: bodyEnv, portId: "gate" } },
      { id: "c3", from: { nodeId: noteCore.gate, portId: "out" }, to: { nodeId: clickEnv, portId: "gate" } },
      { id: "c4", from: { nodeId: vco, portId: "out" }, to: { nodeId: bodyMix, portId: "in1" } },
      { id: "c4b", from: { nodeId: subVco, portId: "out" }, to: { nodeId: bodyMix, portId: "in2" } },
      { id: "c4c", from: { nodeId: bodyMix, portId: "out" }, to: { nodeId: bodyVca, portId: "in" } },
      { id: "c5", from: { nodeId: bodyEnv, portId: "out" }, to: { nodeId: bodyVca, portId: "gainCV" } },
      { id: "c6", from: { nodeId: clickNoise, portId: "out" }, to: { nodeId: clickFilter, portId: "in" } },
      { id: "c7", from: { nodeId: clickEnv, portId: "out" }, to: { nodeId: clickFilter, portId: "cutoffCV" } },
      { id: "c8", from: { nodeId: clickFilter, portId: "out" }, to: { nodeId: clickVca, portId: "in" } },
      { id: "c9", from: { nodeId: clickEnv, portId: "out" }, to: { nodeId: clickVca, portId: "gainCV" } },
      { id: "c10", from: { nodeId: bodyVca, portId: "out" }, to: { nodeId: mix, portId: "in1" } },
      { id: "c11", from: { nodeId: clickVca, portId: "out" }, to: { nodeId: mix, portId: "in2" } },
      { id: "c12", from: { nodeId: mix, portId: "out" }, to: { nodeId: sat, portId: "in" } },
      { id: "c13", from: { nodeId: sat, portId: "out" }, to: { nodeId: out, portId: "in" } }
    ],
    ui: {
      macros: [
        {
          id: "macro_body",
          name: "Body",
          keyframeCount: 2,
          defaultNormalized: 0.76,
          bindings: [
            { id: "b1", nodeId: bodyEnv, paramId: "decay", map: "linear", min: 45, max: 180 },
            { id: "b2", nodeId: bodyEnv, paramId: "release", map: "linear", min: 15, max: 75 },
            { id: "b3", nodeId: bodyVca, paramId: "gain", map: "linear", min: 0.9, max: 1 },
            { id: "b3b", nodeId: bodyMix, paramId: "gain2", map: "linear", min: 0.82, max: 1 }
          ]
        },
        {
          id: "macro_click",
          name: "Click",
          keyframeCount: 2,
          defaultNormalized: 0.2,
          bindings: [
            { id: "b4", nodeId: clickVca, paramId: "gain", map: "linear", min: 0.08, max: 0.58 },
            { id: "b5", nodeId: clickEnv, paramId: "decay", map: "linear", min: 5, max: 50 },
            { id: "b6", nodeId: clickFilter, paramId: "cutoffHz", map: "exp", min: 1800, max: 5200 }
          ]
        },
        {
          id: "macro_drive",
          name: "Drive",
          keyframeCount: 2,
          defaultNormalized: 0.42,
          bindings: [
            { id: "b7", nodeId: sat, paramId: "gainDb", map: "linear", min: 12, max: 24 },
            { id: "b8", nodeId: sat, paramId: "mix", map: "linear", min: 0.18, max: 0.5 }
          ]
        }
      ]
    },
    layout: {
      nodes: [
        { nodeId: vco, x: 2, y: 2 },
        { nodeId: subTranspose, x: 2, y: 5 },
        { nodeId: subVco, x: 6, y: 5 },
        { nodeId: clickNoise, x: 2, y: 7 },
        { nodeId: bodyEnv, x: 7, y: 2 },
        { nodeId: clickEnv, x: 7, y: 8 },
        { nodeId: bodyMix, x: 11, y: 4 },
        { nodeId: clickFilter, x: 12, y: 8 },
        { nodeId: bodyVca, x: 15, y: 2 },
        { nodeId: clickVca, x: 17, y: 8 },
        { nodeId: mix, x: 19, y: 4 },
        { nodeId: sat, x: 21, y: 4 }
      ]
    }
  };
};

export const presetPatches = [
  bassPatch(),
  brassPatch(),
  keysPatch(),
  padPatch(),
  pluckPatch(),
  drumPatch(),
  bassDrumPatch()
].map(normalizeMacroBindingIds);

// Build a fresh default project from the checked-in song template while always
// sourcing preset patches from the latest bundled definitions. Template layouts
// are overlaid by nodeId, so preset graph drift keeps current modules/params
// but preserves matching editor placement where possible.
export const createDefaultProject = (): Project => {
  return {
    ...createDefaultProjectFromTemplate(presetPatches),
    id: createId("project")
  };
};

export const createEmptyProject = (): Project => {
  return {
    ...createEmptyProjectFromPresets(presetPatches),
    id: createId("project")
  };
};
