import { createDefaultParamsForType } from "@/lib/patch/moduleRegistry";
import { createDefaultProjectFromTemplate, createEmptyProjectFromPresets } from "@/lib/defaultProjectTemplate";
import { createId } from "@/lib/ids";
import { normalizeMacroBindingIds } from "@/lib/patch/macroBindings";
import { createPatchOutputPort } from "@/lib/patch/ports";
import { CURRENT_PATCH_SCHEMA_VERSION } from "@/lib/patch/schemaVersion";
import { Project } from "@/types/music";
import { Patch, PatchMeta } from "@/types/patch";

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
  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_bass",
    name: "Bass",
    meta: { source: "preset", presetId: "preset_bass", presetVersion: 16 },
    nodes: [
      {
        id: "cvscale1",
        typeId: "CVScaler",
        params: {
          ...createDefaultParamsForType("CVScaler"),
          scale: 0.32
        }
      },
      {
        id: "cvtranspose1",
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: -1,
          semitones: 0,
          cents: 0
        }
      },
      {
        id: "cvmix1",
        typeId: "CVMixer4",
        params: {
          ...createDefaultParamsForType("CVMixer4"),
          gain1: 1,
          gain2: 1.15,
          gain3: 1,
          gain4: 1
        }
      },
      {
        id: "vco1",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "saw",
          pulseWidth: 0.5,
          baseTuneCents: 0,
          fineTuneCents: -4,
          pwmAmount: 0
        }
      },
      {
        id: "vco2",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "square",
          pulseWidth: 0.42,
          baseTuneCents: 0,
          fineTuneCents: 2,
          pwmAmount: 0
        }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 3.5,
          decay: 32,
          sustain: 0.32,
          release: 12,
          curve: -0.82,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "env2",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 2.5,
          decay: 240,
          sustain: 0,
          release: 20,
          curve: 0,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "mix1",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.66,
          gain2: 0.34,
          gain3: 1,
          gain4: 1
        }
      },
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1
        }
      },
      {
        id: "vcf1",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "lowpass",
          cutoffHz: 324.7284192766965,
          resonance: 0.72,
          cutoffModAmountOct: 3.4
        }
      },
      {
        id: "sat",
        typeId: "Saturation",
        params: {
          ...createDefaultParamsForType("Saturation"),
          driveDb: 10.5,
          mix: 0.34,
          type: "tanh"
        }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -6, limiter: true })],
    connections: [
      {
        id: "c1",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "pitch"
        }
      },
      {
        id: "c2",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "cvtranspose1",
          portId: "in"
        }
      },
      {
        id: "c3",
        from: {
          nodeId: "cvtranspose1",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "pitch"
        }
      },
      {
        id: "c4",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "cvscale1",
          portId: "in"
        }
      },
      {
        id: "c5",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env1",
          portId: "gate"
        }
      },
      {
        id: "c5a",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env2",
          portId: "gate"
        }
      },
      {
        id: "c6",
        from: {
          nodeId: "vco1",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in1"
        }
      },
      {
        id: "c7",
        from: {
          nodeId: "vco2",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in2"
        }
      },
      {
        id: "c8",
        from: {
          nodeId: "mix1",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "in"
        }
      },
      {
        id: "c9",
        from: {
          nodeId: "cvscale1",
          portId: "out"
        },
        to: {
          nodeId: "cvmix1",
          portId: "in1"
        }
      },
      {
        id: "c9a",
        from: {
          nodeId: "env2",
          portId: "out"
        },
        to: {
          nodeId: "cvmix1",
          portId: "in2"
        }
      },
      {
        id: "c9b",
        from: {
          nodeId: "cvmix1",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "cutoffCV"
        }
      },
      {
        id: "c10",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "gainCV"
        }
      },
      {
        id: "c11",
        from: {
          nodeId: "vcf1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "in"
        }
      },
      {
        id: "c12",
        from: {
          nodeId: "vca1",
          portId: "out"
        },
        to: {
          nodeId: "sat",
          portId: "in"
        }
      },
      {
        id: "c13",
        from: {
          nodeId: "sat",
          portId: "out"
        },
        to: {
          nodeId: "output",
          portId: "in"
        }
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
              id: "macro_cutoff:vcf1:cutoffHz",
              nodeId: "vcf1",
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
          bindings: [
            {
              id: "macro_decay:env1:attack",
              nodeId: "env1",
              paramId: "attack",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.6
                },
                {
                  x: 0.5,
                  y: 5.5
                },
                {
                  x: 1,
                  y: 3.5
                }
              ]
            },
            {
              id: "macro_decay:env1:decay",
              nodeId: "env1",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 46
                },
                {
                  x: 0.5,
                  y: 170
                },
                {
                  x: 1,
                  y: 32
                }
              ]
            },
            {
              id: "macro_decay:env1:sustain",
              nodeId: "env1",
              paramId: "sustain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.08
                },
                {
                  x: 0.5,
                  y: 0.45
                },
                {
                  x: 1,
                  y: 0.32
                }
              ]
            },
            {
              id: "macro_decay:env1:release",
              nodeId: "env1",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 28
                },
                {
                  x: 0.5,
                  y: 85
                },
                {
                  x: 1,
                  y: 12
                }
              ]
            },
            {
              id: "macro_decay:mix1:gain1",
              nodeId: "mix1",
              paramId: "gain1",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.74
                },
                {
                  x: 0.5,
                  y: 0.28
                },
                {
                  x: 1,
                  y: 0.66
                }
              ]
            },
            {
              id: "macro_decay:mix1:gain2",
              nodeId: "mix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.38
                },
                {
                  x: 0.5,
                  y: 0.66
                },
                {
                  x: 1,
                  y: 0.34
                }
              ]
            },
            {
              id: "macro_decay:env2:attack",
              nodeId: "env2",
              paramId: "attack",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.5
                },
                {
                  x: 0.5,
                  y: 5
                },
                {
                  x: 1,
                  y: 2.5
                }
              ]
            },
            {
              id: "macro_decay:env2:decay",
              nodeId: "env2",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 68
                },
                {
                  x: 0.5,
                  y: 55
                },
                {
                  x: 1,
                  y: 240
                }
              ]
            },
            {
              id: "macro_decay:cvmix1:gain2",
              nodeId: "cvmix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.82
                },
                {
                  x: 0.5,
                  y: 0.32
                },
                {
                  x: 1,
                  y: 1.15
                }
              ]
            },
            {
              id: "macro_decay:vcf1:cutoffModAmountOct",
              nodeId: "vcf1",
              paramId: "cutoffModAmountOct",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 2.35
                },
                {
                  x: 0.5,
                  y: 0.95
                },
                {
                  x: 1,
                  y: 3.4
                }
              ]
            },
            {
              id: "macro_decay:vcf1:resonance",
              nodeId: "vcf1",
              paramId: "resonance",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.9
                },
                {
                  x: 0.5,
                  y: 0.64
                },
                {
                  x: 1,
                  y: 0.72
                }
              ]
            },
            {
              id: "macro_decay:sat:driveDb",
              nodeId: "sat",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 7.2
                },
                {
                  x: 0.5,
                  y: 3.2
                },
                {
                  x: 1,
                  y: 10.5
                }
              ]
            },
            {
              id: "macro_decay:sat:mix",
              nodeId: "sat",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.28
                },
                {
                  x: 0.5,
                  y: 0.1
                },
                {
                  x: 1,
                  y: 0.34
                }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: []
    }
  };
};

export const padPatch = (): Patch => {
  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_pad",
    name: "Pad",
    meta: { source: "preset", presetId: "preset_pad", presetVersion: 8 },
    nodes: [
      {
        id: "vco1",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "saw",
          pulseWidth: 0.5,
          baseTuneCents: 0,
          fineTuneCents: -2,
          pwmAmount: 0
        }
      },
      {
        id: "vco2",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "square",
          pulseWidth: 0.42,
          baseTuneCents: 0,
          fineTuneCents: 2,
          pwmAmount: 0.12
        }
      },
      {
        id: "lfo1",
        typeId: "LFO",
        params: {
          ...createDefaultParamsForType("LFO"),
          wave: "triangle",
          freqHz: 0.5,
          pulseWidth: 0.5,
          bipolar: true
        }
      },
      {
        id: "mix1",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.52,
          gain2: 0.38,
          gain3: 1,
          gain4: 1
        }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 850,
          decay: 900,
          sustain: 0.78,
          release: 870,
          curve: -0.18,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "vcf1",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "lowpass",
          cutoffHz: 1550,
          resonance: 0.84,
          cutoffModAmountOct: 0.9
        }
      },
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1
        }
      },
      {
        id: "sat1",
        typeId: "Saturation",
        params: {
          ...createDefaultParamsForType("Saturation"),
          driveDb: 3.5,
          mix: 0.12,
          type: "tanh"
        }
      },
      {
        id: "motionDampEnv",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 8,
          decay: 1700,
          sustain: 0.13,
          release: 700,
          curve: -0.45,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "motionDepthVca",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1
        }
      },
      {
        id: "pwmDepthVca",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1
        }
      },
      {
        id: "pwmDampEnv",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 8,
          decay: 2200,
          sustain: 0.16,
          release: 700,
          curve: -0.35,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "detuneSettleEnv",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 2300,
          sustain: 0,
          release: 650,
          curve: -0.45,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "detunePitchMix1",
        typeId: "CVMixer4",
        params: {
          ...createDefaultParamsForType("CVMixer4"),
          gain1: 1,
          gain2: -0.008,
          gain3: 0,
          gain4: 0
        }
      },
      {
        id: "detunePitchMix2",
        typeId: "CVMixer4",
        params: {
          ...createDefaultParamsForType("CVMixer4"),
          gain1: 1,
          gain2: 0.008,
          gain3: 0,
          gain4: 0
        }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -6, limiter: true })],
    connections: [
      {
        id: "c3",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env1",
          portId: "gate"
        }
      },
      {
        id: "c5",
        from: {
          nodeId: "vco1",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in1"
        }
      },
      {
        id: "c6",
        from: {
          nodeId: "vco2",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in2"
        }
      },
      {
        id: "c8",
        from: {
          nodeId: "mix1",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "in"
        }
      },
      {
        id: "c9",
        from: {
          nodeId: "vcf1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "in"
        }
      },
      {
        id: "c10",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "gainCV"
        }
      },
      {
        id: "c12",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "motionDampEnv",
          portId: "gate"
        }
      },
      {
        id: "c13",
        from: {
          nodeId: "lfo1",
          portId: "out"
        },
        to: {
          nodeId: "motionDepthVca",
          portId: "in"
        }
      },
      {
        id: "c14",
        from: {
          nodeId: "motionDampEnv",
          portId: "out"
        },
        to: {
          nodeId: "motionDepthVca",
          portId: "gainCV"
        }
      },
      {
        id: "c15",
        from: {
          nodeId: "motionDepthVca",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "cutoffCV"
        }
      },
      {
        id: "c16",
        from: {
          nodeId: "lfo1",
          portId: "out"
        },
        to: {
          nodeId: "pwmDepthVca",
          portId: "in"
        }
      },
      {
        id: "c18",
        from: {
          nodeId: "pwmDepthVca",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "pwm"
        }
      },
      {
        id: "c19",
        from: {
          nodeId: "vca1",
          portId: "out"
        },
        to: {
          nodeId: "sat1",
          portId: "in"
        }
      },
      {
        id: "c20",
        from: {
          nodeId: "sat1",
          portId: "out"
        },
        to: {
          nodeId: "output",
          portId: "in"
        }
      },
      {
        id: "c21",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "pwmDampEnv",
          portId: "gate"
        }
      },
      {
        id: "c22",
        from: {
          nodeId: "pwmDampEnv",
          portId: "out"
        },
        to: {
          nodeId: "pwmDepthVca",
          portId: "gainCV"
        }
      },
      {
        id: "c_detune_gate",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "detuneSettleEnv",
          portId: "gate"
        }
      },
      {
        id: "c_pitch_to_detuneMix1",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "detunePitchMix1",
          portId: "in1"
        }
      },
      {
        id: "c_pitch_to_detuneMix2",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "detunePitchMix2",
          portId: "in1"
        }
      },
      {
        id: "c_detuneEnv_to_mix1",
        from: {
          nodeId: "detuneSettleEnv",
          portId: "out"
        },
        to: {
          nodeId: "detunePitchMix1",
          portId: "in2"
        }
      },
      {
        id: "c_detuneEnv_to_mix2",
        from: {
          nodeId: "detuneSettleEnv",
          portId: "out"
        },
        to: {
          nodeId: "detunePitchMix2",
          portId: "in2"
        }
      },
      {
        id: "c_detuneMix1_to_vco1_pitch",
        from: {
          nodeId: "detunePitchMix1",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "pitch"
        }
      },
      {
        id: "c_detuneMix2_to_vco2_pitch",
        from: {
          nodeId: "detunePitchMix2",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "pitch"
        }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_release",
          name: "Release",
          keyframeCount: 2,
          defaultNormalized: 0.32,
          bindings: [
            {
              id: "macro_release:env1:release",
              nodeId: "env1",
              paramId: "release",
              map: "linear",
              min: 150,
              max: 2400
            }
          ]
        },
        {
          id: "macro_attack",
          name: "Bite",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_attack:env1:attack",
              nodeId: "env1",
              paramId: "attack",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1400
                },
                {
                  x: 0.5,
                  y: 850
                },
                {
                  x: 1,
                  y: 65
                }
              ]
            },
            {
              id: "macro_attack:env1:curve",
              nodeId: "env1",
              paramId: "curve",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: -0.18
                },
                {
                  x: 1,
                  y: -0.72
                }
              ]
            },
            {
              id: "macro_attack:mix1:gain1",
              nodeId: "mix1",
              paramId: "gain1",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.46
                },
                {
                  x: 0.5,
                  y: 0.52
                },
                {
                  x: 1,
                  y: 0.58
                }
              ]
            },
            {
              id: "macro_attack:mix1:gain2",
              nodeId: "mix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.4
                },
                {
                  x: 0.5,
                  y: 0.38
                },
                {
                  x: 1,
                  y: 0.34
                }
              ]
            },
            {
              id: "macro_attack:sat1:driveDb",
              nodeId: "sat1",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1.5
                },
                {
                  x: 0.5,
                  y: 3.5
                },
                {
                  x: 1,
                  y: 14.976
                }
              ]
            },
            {
              id: "macro_attack:sat1:mix",
              nodeId: "sat1",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.04
                },
                {
                  x: 0.5,
                  y: 0.12
                },
                {
                  x: 1,
                  y: 0.534
                }
              ]
            }
          ]
        },
        {
          id: "macro_motion",
          name: "Motion",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_motion:lfo1:freqHz",
              nodeId: "lfo1",
              paramId: "freqHz",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.025
                },
                {
                  x: 0.5,
                  y: 0.5
                },
                {
                  x: 1,
                  y: 1.05
                }
              ]
            },
            {
              id: "macro_motion:vco2:pwmAmount",
              nodeId: "vco2",
              paramId: "pwmAmount",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.12
                },
                {
                  x: 1,
                  y: 0.16
                }
              ]
            },
            {
              id: "macro_motion:vcf1:cutoffModAmountOct",
              nodeId: "vcf1",
              paramId: "cutoffModAmountOct",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.02
                },
                {
                  x: 0.5,
                  y: 0.9
                },
                {
                  x: 1,
                  y: 1.05
                }
              ]
            },
            {
              id: "macro_motion:vcf1:cutoffHz",
              nodeId: "vcf1",
              paramId: "cutoffHz",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1200
                },
                {
                  x: 0.5,
                  y: 1550
                },
                {
                  x: 1,
                  y: 2200
                }
              ]
            },
            {
              id: "macro_motion:motionDampEnv:decay",
              nodeId: "motionDampEnv",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 900
                },
                {
                  x: 0.5,
                  y: 1700
                },
                {
                  x: 1,
                  y: 3200
                }
              ]
            },
            {
              id: "macro_motion:motionDampEnv:sustain",
              nodeId: "motionDampEnv",
              paramId: "sustain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.02
                },
                {
                  x: 0.5,
                  y: 0.13
                },
                {
                  x: 1,
                  y: 0.16
                }
              ]
            },
            {
              id: "macro_motion:pwmDampEnv:decay",
              nodeId: "pwmDampEnv",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 900
                },
                {
                  x: 0.5,
                  y: 2200
                },
                {
                  x: 1,
                  y: 2800
                }
              ]
            },
            {
              id: "macro_motion:pwmDampEnv:sustain",
              nodeId: "pwmDampEnv",
              paramId: "sustain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.02
                },
                {
                  x: 0.5,
                  y: 0.16
                },
                {
                  x: 1,
                  y: 0.18
                }
              ]
            },
            {
              id: "macro_motion:detunePitchMix1:gain2",
              nodeId: "detunePitchMix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: -0.008
                },
                {
                  x: 1,
                  y: -0.01
                }
              ]
            },
            {
              id: "macro_motion:detunePitchMix2:gain2",
              nodeId: "detunePitchMix2",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.008
                },
                {
                  x: 1,
                  y: 0.01
                }
              ]
            },
            {
              id: "macro_motion:detuneSettleEnv:decay",
              nodeId: "detuneSettleEnv",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 900
                },
                {
                  x: 0.5,
                  y: 2300
                },
                {
                  x: 1,
                  y: 3000
                }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: []
    }
  };
};

export const guitarStringPatch = (): Patch => {
  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_guitar_string",
    name: "Guitar String",
    meta: { source: "preset", presetId: "preset_guitar_string", presetVersion: 1 },
    nodes: [
      {
        id: "karplus1",
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.986,
          damping: 0.48,
          brightness: 0.3400000000000001,
          excitation: "noise"
        }
      },
      {
        id: "cvtranspose1",
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: -1,
          semitones: 0,
          cents: 3
        }
      },
      {
        id: "karplus2",
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.991,
          damping: 0.56,
          brightness: 0.24,
          excitation: "noise"
        }
      },
      {
        id: "karplus3",
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.995,
          damping: 0.66,
          brightness: 0.12,
          excitation: "noise"
        }
      },
      {
        id: "karplus4",
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.993,
          damping: 0.62,
          brightness: 0.1,
          excitation: "noise"
        }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 34,
          sustain: 0.92,
          release: 460,
          curve: 0,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "mix1",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.82,
          gain2: 0.3,
          gain3: 0.12,
          gain4: 0.04
        }
      },
      {
        id: "vcf1",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "lowpass",
          cutoffHz: 1450,
          resonance: 0.78,
          cutoffModAmountOct: 0.42
        }
      },
      {
        id: "vca2",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1.28
        }
      },
      {
        id: "sat_body",
        typeId: "Saturation",
        params: {
          ...createDefaultParamsForType("Saturation"),
          driveDb: 2.5,
          mix: 0.07,
          type: "tanh"
        }
      },
      {
        id: "body_room",
        typeId: "Reverb",
        params: {
          ...createDefaultParamsForType("Reverb"),
          mode: "room",
          decay: 0.12,
          tone: 0.48,
          mix: 0.035
        }
      },
      {
        id: "metal_ping_vco",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "square",
          pulseWidth: 0.26,
          baseTuneCents: 1200,
          fineTuneCents: 7,
          pwmAmount: 0
        }
      },
      {
        id: "metal_ping_env",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 18,
          sustain: 0,
          release: 22,
          curve: -0.35,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "metal_ping_vca",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.034999999999999976
        }
      },
      {
        id: "post_mix_metal",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 1,
          gain2: 0.07999999999999996,
          gain3: 0,
          gain4: 0
        }
      },
      {
        id: "drive_overdrive",
        typeId: "Overdrive",
        params: {
          ...createDefaultParamsForType("Overdrive"),
          driveDb: 40.168,
          tone: 0.88056,
          mode: "overdrive"
        }
      },
      {
        id: "drive_noise",
        typeId: "Noise",
        params: {
          ...createDefaultParamsForType("Noise"),
          color: "white",
          gain: 0.62
        }
      },
      {
        id: "drive_noise_filter",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "highpass",
          cutoffHz: 6157.6,
          resonance: 0.26056,
          cutoffModAmountOct: 0
        }
      },
      {
        id: "drive_noise_vca",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.13408
        }
      },
      {
        id: "drive_mix",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.5848,
          gain2: 0.92872,
          gain3: 0.19084,
          gain4: 0
        }
      },
      {
        id: "drive_noise_env",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 61.9,
          sustain: 0,
          release: 37.464,
          curve: -0.45,
          mode: "retrigger_from_zero"
        }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -6, limiter: true })],
    connections: [
      {
        id: "c1",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "karplus1",
          portId: "pitch"
        }
      },
      {
        id: "c1b",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "cvtranspose1",
          portId: "in"
        }
      },
      {
        id: "c1c",
        from: {
          nodeId: "cvtranspose1",
          portId: "out"
        },
        to: {
          nodeId: "karplus2",
          portId: "pitch"
        }
      },
      {
        id: "c1d",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "karplus3",
          portId: "pitch"
        }
      },
      {
        id: "c1e",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "karplus4",
          portId: "pitch"
        }
      },
      {
        id: "c2",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env1",
          portId: "gate"
        }
      },
      {
        id: "c5a",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "karplus1",
          portId: "gate"
        }
      },
      {
        id: "c5b",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "karplus2",
          portId: "gate"
        }
      },
      {
        id: "c5c",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "karplus3",
          portId: "gate"
        }
      },
      {
        id: "c5d",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "karplus4",
          portId: "gate"
        }
      },
      {
        id: "c7",
        from: {
          nodeId: "karplus1",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in1"
        }
      },
      {
        id: "c7b",
        from: {
          nodeId: "karplus2",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in2"
        }
      },
      {
        id: "c7c",
        from: {
          nodeId: "karplus3",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in3"
        }
      },
      {
        id: "c7d",
        from: {
          nodeId: "karplus4",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in4"
        }
      },
      {
        id: "c8",
        from: {
          nodeId: "mix1",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "in"
        }
      },
      {
        id: "c9",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "cutoffCV"
        }
      },
      {
        id: "c10",
        from: {
          nodeId: "vcf1",
          portId: "out"
        },
        to: {
          nodeId: "vca2",
          portId: "in"
        }
      },
      {
        id: "c11",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vca2",
          portId: "gainCV"
        }
      },
      {
        id: "c12c",
        from: {
          nodeId: "body_room",
          portId: "out"
        },
        to: {
          nodeId: "output",
          portId: "in"
        }
      },
      {
        id: "c_metal_pitch",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "metal_ping_vco",
          portId: "pitch"
        }
      },
      {
        id: "c_metal_gate",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "metal_ping_env",
          portId: "gate"
        }
      },
      {
        id: "c_metal_audio",
        from: {
          nodeId: "metal_ping_vco",
          portId: "out"
        },
        to: {
          nodeId: "metal_ping_vca",
          portId: "in"
        }
      },
      {
        id: "c_metal_env",
        from: {
          nodeId: "metal_ping_env",
          portId: "out"
        },
        to: {
          nodeId: "metal_ping_vca",
          portId: "gainCV"
        }
      },
      {
        id: "c_post_main",
        from: {
          nodeId: "vca2",
          portId: "out"
        },
        to: {
          nodeId: "post_mix_metal",
          portId: "in1"
        }
      },
      {
        id: "c_post_metal",
        from: {
          nodeId: "metal_ping_vca",
          portId: "out"
        },
        to: {
          nodeId: "post_mix_metal",
          portId: "in2"
        }
      },
      {
        id: "c_post_to_sat",
        from: {
          nodeId: "post_mix_metal",
          portId: "out"
        },
        to: {
          nodeId: "sat_body",
          portId: "in"
        }
      },
      {
        id: "c_drive_clean_to_mix",
        from: {
          nodeId: "sat_body",
          portId: "out"
        },
        to: {
          nodeId: "drive_mix",
          portId: "in1"
        }
      },
      {
        id: "c_drive_to_od",
        from: {
          nodeId: "sat_body",
          portId: "out"
        },
        to: {
          nodeId: "drive_overdrive",
          portId: "in"
        }
      },
      {
        id: "c_drive_od_to_mix",
        from: {
          nodeId: "drive_overdrive",
          portId: "out"
        },
        to: {
          nodeId: "drive_mix",
          portId: "in2"
        }
      },
      {
        id: "c_drive_noise_to_filter",
        from: {
          nodeId: "drive_noise",
          portId: "out"
        },
        to: {
          nodeId: "drive_noise_filter",
          portId: "in"
        }
      },
      {
        id: "c_drive_noise_filter_to_vca",
        from: {
          nodeId: "drive_noise_filter",
          portId: "out"
        },
        to: {
          nodeId: "drive_noise_vca",
          portId: "in"
        }
      },
      {
        id: "c_drive_noise_to_mix",
        from: {
          nodeId: "drive_noise_vca",
          portId: "out"
        },
        to: {
          nodeId: "drive_mix",
          portId: "in3"
        }
      },
      {
        id: "c_drive_mix_to_room",
        from: {
          nodeId: "drive_mix",
          portId: "out"
        },
        to: {
          nodeId: "body_room",
          portId: "in"
        }
      },
      {
        id: "c_drive_noise_gate",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "drive_noise_env",
          portId: "gate"
        }
      },
      {
        id: "c_drive_noise_env_short",
        from: {
          nodeId: "drive_noise_env",
          portId: "out"
        },
        to: {
          nodeId: "drive_noise_vca",
          portId: "gainCV"
        }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_drive",
          name: "Drive",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_drive:drive_mix:gain1",
              nodeId: "drive_mix",
              paramId: "gain1",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 0.72
                },
                {
                  x: 1,
                  y: 0.52
                }
              ]
            },
            {
              id: "macro_drive:drive_mix:gain2",
              nodeId: "drive_mix",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.78
                },
                {
                  x: 1,
                  y: 1
                }
              ]
            },
            {
              id: "macro_drive:drive_overdrive:driveDb",
              nodeId: "drive_overdrive",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 28
                },
                {
                  x: 1,
                  y: 46
                }
              ]
            },
            {
              id: "macro_drive:drive_overdrive:tone",
              nodeId: "drive_overdrive",
              paramId: "tone",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.6
                },
                {
                  x: 0.5,
                  y: 0.84
                },
                {
                  x: 1,
                  y: 0.9
                }
              ]
            },
            {
              id: "macro_drive:drive_noise_vca:gain",
              nodeId: "drive_noise_vca",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.08
                },
                {
                  x: 1,
                  y: 0.16
                }
              ]
            },
            {
              id: "macro_drive:drive_mix:gain3",
              nodeId: "drive_mix",
              paramId: "gain3",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.13
                },
                {
                  x: 1,
                  y: 0.22
                }
              ]
            },
            {
              id: "macro_drive:drive_noise_filter:cutoffHz",
              nodeId: "drive_noise_filter",
              paramId: "cutoffHz",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 3200
                },
                {
                  x: 0.5,
                  y: 4400
                },
                {
                  x: 1,
                  y: 7000
                }
              ]
            },
            {
              id: "macro_drive:drive_noise_filter:resonance",
              nodeId: "drive_noise_filter",
              paramId: "resonance",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.14
                },
                {
                  x: 0.5,
                  y: 0.22
                },
                {
                  x: 1,
                  y: 0.28
                }
              ]
            },
            {
              id: "macro_drive:drive_noise_env:decay",
              nodeId: "drive_noise_env",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 20
                },
                {
                  x: 0.5,
                  y: 45
                },
                {
                  x: 1,
                  y: 70
                }
              ]
            },
            {
              id: "macro_drive:drive_noise_env:release",
              nodeId: "drive_noise_env",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 15
                },
                {
                  x: 0.5,
                  y: 28
                },
                {
                  x: 1,
                  y: 42
                }
              ]
            },
            {
              id: "macro_drive:drive_noise_env:sustain",
              nodeId: "drive_noise_env",
              paramId: "sustain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0
                },
                {
                  x: 1,
                  y: 0
                }
              ]
            }
          ]
        },
        {
          id: "macro_tone",
          name: "Tightness",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_tone:vcf1:cutoffHz",
              nodeId: "vcf1",
              paramId: "cutoffHz",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 780
                },
                {
                  x: 0.5,
                  y: 1450
                },
                {
                  x: 1,
                  y: 4200
                }
              ]
            },
            {
              id: "macro_tone:karplus1:damping",
              nodeId: "karplus1",
              paramId: "damping",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.72
                },
                {
                  x: 0.5,
                  y: 0.48
                },
                {
                  x: 1,
                  y: 0.12
                }
              ]
            },
            {
              id: "macro_tone:karplus2:damping",
              nodeId: "karplus2",
              paramId: "damping",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.78
                },
                {
                  x: 0.5,
                  y: 0.56
                },
                {
                  x: 1,
                  y: 0.22
                }
              ]
            },
            {
              id: "macro_tone:karplus3:damping",
              nodeId: "karplus3",
              paramId: "damping",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.84
                },
                {
                  x: 0.5,
                  y: 0.66
                },
                {
                  x: 1,
                  y: 0.36
                }
              ]
            },
            {
              id: "macro_tone:karplus4:damping",
              nodeId: "karplus4",
              paramId: "damping",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.82
                },
                {
                  x: 0.5,
                  y: 0.62
                },
                {
                  x: 1,
                  y: 0.3
                }
              ]
            },
            {
              id: "macro_tone:karplus1:decay",
              nodeId: "karplus1",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.972
                },
                {
                  x: 0.5,
                  y: 0.986
                },
                {
                  x: 1,
                  y: 0.9945
                }
              ]
            },
            {
              id: "macro_tone:karplus2:decay",
              nodeId: "karplus2",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.98
                },
                {
                  x: 0.5,
                  y: 0.991
                },
                {
                  x: 1,
                  y: 0.9965
                }
              ]
            },
            {
              id: "macro_tone:karplus3:decay",
              nodeId: "karplus3",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.987
                },
                {
                  x: 0.5,
                  y: 0.995
                },
                {
                  x: 1,
                  y: 0.9988
                }
              ]
            },
            {
              id: "macro_tone:karplus4:decay",
              nodeId: "karplus4",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.984
                },
                {
                  x: 0.5,
                  y: 0.993
                },
                {
                  x: 1,
                  y: 0.9978
                }
              ]
            },
            {
              id: "macro_tone:cvtranspose1:cents",
              nodeId: "cvtranspose1",
              paramId: "cents",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: -10
                },
                {
                  x: 0.5,
                  y: 3
                },
                {
                  x: 1,
                  y: 18
                }
              ]
            },
            {
              id: "macro_tone:vcf1:cutoffModAmountOct",
              nodeId: "vcf1",
              paramId: "cutoffModAmountOct",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.14
                },
                {
                  x: 0.5,
                  y: 0.42
                },
                {
                  x: 1,
                  y: 1.05
                }
              ]
            },
            {
              id: "macro_tone:vca2:gain",
              nodeId: "vca2",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1.55
                },
                {
                  x: 0.5,
                  y: 1.28
                },
                {
                  x: 1,
                  y: 1.05
                }
              ]
            },
            {
              id: "macro_tone:env1:release",
              nodeId: "env1",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 260
                },
                {
                  x: 0.5,
                  y: 460
                },
                {
                  x: 1,
                  y: 700
                }
              ]
            }
          ]
        },
        {
          id: "macro_material",
          name: "Material",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_material:karplus1:brightness",
              nodeId: "karplus1",
              paramId: "brightness",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 0.34
                },
                {
                  x: 1,
                  y: 0.38
                }
              ]
            },
            {
              id: "macro_material:karplus2:brightness",
              nodeId: "karplus2",
              paramId: "brightness",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.05
                },
                {
                  x: 0.5,
                  y: 0.24
                },
                {
                  x: 1,
                  y: 0.3
                }
              ]
            },
            {
              id: "macro_material:karplus3:brightness",
              nodeId: "karplus3",
              paramId: "brightness",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.01
                },
                {
                  x: 0.5,
                  y: 0.12
                },
                {
                  x: 1,
                  y: 0.16
                }
              ]
            },
            {
              id: "macro_material:karplus4:brightness",
              nodeId: "karplus4",
              paramId: "brightness",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.01
                },
                {
                  x: 0.5,
                  y: 0.1
                },
                {
                  x: 1,
                  y: 0.2
                }
              ]
            },
            {
              id: "macro_material:vcf1:resonance",
              nodeId: "vcf1",
              paramId: "resonance",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.22
                },
                {
                  x: 0.5,
                  y: 0.78
                },
                {
                  x: 1,
                  y: 0.86
                }
              ]
            },
            {
              id: "macro_material:mix1:gain1",
              nodeId: "mix1",
              paramId: "gain1",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1.16
                },
                {
                  x: 0.5,
                  y: 0.82
                },
                {
                  x: 1,
                  y: 0.48
                }
              ]
            },
            {
              id: "macro_material:mix1:gain2",
              nodeId: "mix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.3
                },
                {
                  x: 1,
                  y: 0.76
                }
              ]
            },
            {
              id: "macro_material:mix1:gain3",
              nodeId: "mix1",
              paramId: "gain3",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.12
                },
                {
                  x: 1,
                  y: 0.62
                }
              ]
            },
            {
              id: "macro_material:mix1:gain4",
              nodeId: "mix1",
              paramId: "gain4",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.04
                },
                {
                  x: 1,
                  y: 0.34
                }
              ]
            },
            {
              id: "macro_material:env1:decay",
              nodeId: "env1",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 3
                },
                {
                  x: 0.5,
                  y: 34
                },
                {
                  x: 1,
                  y: 110
                }
              ]
            },
            {
              id: "macro_material:env1:sustain",
              nodeId: "env1",
              paramId: "sustain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.58
                },
                {
                  x: 0.5,
                  y: 0.92
                },
                {
                  x: 1,
                  y: 1
                }
              ]
            },
            {
              id: "macro_material:sat_body:driveDb",
              nodeId: "sat_body",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 15
                },
                {
                  x: 0.5,
                  y: 2.5
                },
                {
                  x: 1,
                  y: 0.8
                }
              ]
            },
            {
              id: "macro_material:sat_body:mix",
              nodeId: "sat_body",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.38
                },
                {
                  x: 0.5,
                  y: 0.07
                },
                {
                  x: 1,
                  y: 0.02
                }
              ]
            },
            {
              id: "macro_material:body_room:decay",
              nodeId: "body_room",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.12
                },
                {
                  x: 1,
                  y: 0.42
                }
              ]
            },
            {
              id: "macro_material:body_room:tone",
              nodeId: "body_room",
              paramId: "tone",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.82
                },
                {
                  x: 0.5,
                  y: 0.48
                },
                {
                  x: 1,
                  y: 0.35
                }
              ]
            },
            {
              id: "macro_material:body_room:mix",
              nodeId: "body_room",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.035
                },
                {
                  x: 1,
                  y: 0.16
                }
              ]
            },
            {
              id: "macro_material:metal_ping_vca:gain",
              nodeId: "metal_ping_vca",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.32
                },
                {
                  x: 0.5,
                  y: 0.035
                },
                {
                  x: 1,
                  y: 0
                }
              ]
            },
            {
              id: "macro_material:metal_ping_vco:pulseWidth",
              nodeId: "metal_ping_vco",
              paramId: "pulseWidth",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.12
                },
                {
                  x: 0.5,
                  y: 0.26
                },
                {
                  x: 1,
                  y: 0.5
                }
              ]
            },
            {
              id: "macro_material:post_mix_metal:gain2",
              nodeId: "post_mix_metal",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.62
                },
                {
                  x: 0.5,
                  y: 0.08
                },
                {
                  x: 1,
                  y: 0
                }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: []
    }
  };
};

export const keysPatch = (): Patch => {
  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_keys",
    name: "Piano-ish",
    meta: { source: "preset", presetId: "preset_keys", presetVersion: 5 },
    nodes: [
      {
        id: "vco1",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "sine",
          pulseWidth: 0.5,
          baseTuneCents: -1200,
          fineTuneCents: 0,
          pwmAmount: 0
        }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 7.319999999999999,
          decay: 842,
          sustain: 0.08,
          release: 408.48,
          curve: -0.45,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1
        }
      },
      {
        id: "sat",
        typeId: "Saturation",
        params: {
          ...createDefaultParamsForType("Saturation"),
          driveDb: 9.882000000000001,
          mix: 0.556,
          type: "tanh"
        }
      },
      {
        id: "string1",
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.984256,
          damping: 0.65,
          brightness: 0.38,
          excitation: "noise"
        }
      },
      {
        id: "detune_up",
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: 0,
          semitones: 0,
          cents: 2
        }
      },
      {
        id: "string2",
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.9926128,
          damping: 0.65,
          brightness: 0.28,
          excitation: "noise"
        }
      },
      {
        id: "detune_down",
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: 0,
          semitones: 0,
          cents: -3
        }
      },
      {
        id: "string3",
        typeId: "KarplusStrong",
        params: {
          ...createDefaultParamsForType("KarplusStrong"),
          decay: 0.9908368,
          damping: 0.65,
          brightness: 0.11,
          excitation: "noise"
        }
      },
      {
        id: "hammer_noise",
        typeId: "Noise",
        params: {
          ...createDefaultParamsForType("Noise"),
          color: "pink",
          gain: 1
        }
      },
      {
        id: "hammer_env",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 26.746,
          sustain: 0,
          release: 21.192,
          curve: -0.55,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "hammer_filter",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "bandpass",
          cutoffHz: 1345.956412737304,
          resonance: 0.24552000000000002,
          cutoffModAmountOct: 0.25
        }
      },
      {
        id: "hammer_vca",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.10286000000000001
        }
      },
      {
        id: "piano_mix",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.56,
          gain2: 0.24,
          gain3: 0.11,
          gain4: 0.23
        }
      },
      {
        id: "body_filter",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "lowpass",
          cutoffHz: 2800.0000000000005,
          resonance: 0.1,
          cutoffModAmountOct: 0.35
        }
      },
      {
        id: "room",
        typeId: "Reverb",
        params: {
          ...createDefaultParamsForType("Reverb"),
          mode: "room",
          decay: 0.22,
          tone: 0.5,
          mix: 0.1
        }
      },
      {
        id: "body_blend",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.82,
          gain2: 0.28,
          gain3: 0.2,
          gain4: 0
        }
      },
      {
        id: "node_mp3sby4v_xwpen4",
        typeId: "Compressor",
        params: {
          ...createDefaultParamsForType("Compressor"),
          squash: 0.207522,
          attackMs: 185.82,
          mix: 0.18666000000000002
        }
      },
      {
        id: "node_mp3tg8q6_85svfx",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "triangle",
          pulseWidth: 0.5,
          baseTuneCents: 0,
          fineTuneCents: 0,
          pwmAmount: 0
        }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -6, limiter: true })],
    connections: [
      {
        id: "c1",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "pitch"
        }
      },
      {
        id: "c2",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env1",
          portId: "gate"
        }
      },
      {
        id: "c4",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "gainCV"
        }
      },
      {
        id: "c5",
        from: {
          nodeId: "vca1",
          portId: "out"
        },
        to: {
          nodeId: "sat",
          portId: "in"
        }
      },
      {
        id: "c_pitch_string1",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "string1",
          portId: "pitch"
        }
      },
      {
        id: "c_pitch_detune_up",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "detune_up",
          portId: "in"
        }
      },
      {
        id: "c_detune_up_string2",
        from: {
          nodeId: "detune_up",
          portId: "out"
        },
        to: {
          nodeId: "string2",
          portId: "pitch"
        }
      },
      {
        id: "c_pitch_detune_down",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "detune_down",
          portId: "in"
        }
      },
      {
        id: "c_detune_down_string3",
        from: {
          nodeId: "detune_down",
          portId: "out"
        },
        to: {
          nodeId: "string3",
          portId: "pitch"
        }
      },
      {
        id: "c_gate_string1",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "string1",
          portId: "gate"
        }
      },
      {
        id: "c_gate_string2",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "string2",
          portId: "gate"
        }
      },
      {
        id: "c_gate_string3",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "string3",
          portId: "gate"
        }
      },
      {
        id: "c_gate_hammer_env",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "hammer_env",
          portId: "gate"
        }
      },
      {
        id: "c_hammer_noise_filter",
        from: {
          nodeId: "hammer_noise",
          portId: "out"
        },
        to: {
          nodeId: "hammer_filter",
          portId: "in"
        }
      },
      {
        id: "c_hammer_env_filter",
        from: {
          nodeId: "hammer_env",
          portId: "out"
        },
        to: {
          nodeId: "hammer_filter",
          portId: "cutoffCV"
        }
      },
      {
        id: "c_hammer_filter_vca",
        from: {
          nodeId: "hammer_filter",
          portId: "out"
        },
        to: {
          nodeId: "hammer_vca",
          portId: "in"
        }
      },
      {
        id: "c_hammer_env_vca",
        from: {
          nodeId: "hammer_env",
          portId: "out"
        },
        to: {
          nodeId: "hammer_vca",
          portId: "gainCV"
        }
      },
      {
        id: "c_string1_mix",
        from: {
          nodeId: "string1",
          portId: "out"
        },
        to: {
          nodeId: "piano_mix",
          portId: "in1"
        }
      },
      {
        id: "c_string2_mix",
        from: {
          nodeId: "string2",
          portId: "out"
        },
        to: {
          nodeId: "piano_mix",
          portId: "in2"
        }
      },
      {
        id: "c_string3_mix",
        from: {
          nodeId: "string3",
          portId: "out"
        },
        to: {
          nodeId: "piano_mix",
          portId: "in3"
        }
      },
      {
        id: "c_hammer_mix",
        from: {
          nodeId: "hammer_vca",
          portId: "out"
        },
        to: {
          nodeId: "piano_mix",
          portId: "in4"
        }
      },
      {
        id: "c_hammer_env_body_filter",
        from: {
          nodeId: "hammer_env",
          portId: "out"
        },
        to: {
          nodeId: "body_filter",
          portId: "cutoffCV"
        }
      },
      {
        id: "c_body_filter_vca",
        from: {
          nodeId: "body_filter",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "in"
        }
      },
      {
        id: "c_room_output",
        from: {
          nodeId: "room",
          portId: "out"
        },
        to: {
          nodeId: "output",
          portId: "in"
        }
      },
      {
        id: "c_piano_mix_body_blend",
        from: {
          nodeId: "piano_mix",
          portId: "out"
        },
        to: {
          nodeId: "body_blend",
          portId: "in1"
        }
      },
      {
        id: "c_vco_body_blend",
        from: {
          nodeId: "vco1",
          portId: "out"
        },
        to: {
          nodeId: "body_blend",
          portId: "in2"
        }
      },
      {
        id: "c_body_blend_filter",
        from: {
          nodeId: "body_blend",
          portId: "out"
        },
        to: {
          nodeId: "body_filter",
          portId: "in"
        }
      },
      {
        id: "conn_mp3sc68o_2qyzdb",
        from: {
          nodeId: "sat",
          portId: "out"
        },
        to: {
          nodeId: "node_mp3sby4v_xwpen4",
          portId: "in"
        }
      },
      {
        id: "conn_mp3sc8sl_mschmg",
        from: {
          nodeId: "node_mp3sby4v_xwpen4",
          portId: "out"
        },
        to: {
          nodeId: "room",
          portId: "in"
        }
      },
      {
        id: "conn_mp3tghj2_0u4ivu",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "node_mp3tg8q6_85svfx",
          portId: "pitch"
        }
      },
      {
        id: "conn_mp3tgjch_cosa09",
        from: {
          nodeId: "node_mp3tg8q6_85svfx",
          portId: "out"
        },
        to: {
          nodeId: "body_blend",
          portId: "in3"
        }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_brightness",
          name: "Brightness",
          keyframeCount: 2,
          defaultNormalized: 0.33,
          bindings: [
            {
              id: "macro_brightness:sat:driveDb",
              nodeId: "sat",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 18
            },
            {
              id: "macro_brightness:node_mp3sby4v_xwpen4:squash",
              nodeId: "node_mp3sby4v_xwpen4",
              paramId: "squash",
              map: "linear",
              min: 0,
              max: 0.378
            },
            {
              id: "macro_brightness:node_mp3sby4v_xwpen4:mix",
              nodeId: "node_mp3sby4v_xwpen4",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 0.34
            }
          ]
        },
        {
          id: "macro_decay",
          name: "Decay",
          keyframeCount: 2,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "macro_decay:string1:decay",
              nodeId: "string1",
              paramId: "decay",
              map: "linear",
              min: 0.98,
              max: 0.999
            },
            {
              id: "macro_decay:string2:decay",
              nodeId: "string2",
              paramId: "decay",
              map: "linear",
              min: 0.991,
              max: 0.9982
            },
            {
              id: "macro_decay:string3:decay",
              nodeId: "string3",
              paramId: "decay",
              map: "linear",
              min: 0.989,
              max: 0.9972
            },
            {
              id: "macro_decay:env1:decay",
              nodeId: "env1",
              paramId: "decay",
              map: "linear",
              min: 450,
              max: 2200
            },
            {
              id: "macro_decay:env1:release",
              nodeId: "env1",
              paramId: "release",
              map: "linear",
              min: 180,
              max: 1200
            }
          ]
        },
        {
          id: "macro_tone",
          name: "Tone",
          keyframeCount: 3,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "macro_tone:body_filter:cutoffHz",
              nodeId: "body_filter",
              paramId: "cutoffHz",
              map: "exp",
              min: 620,
              max: 3200,
              points: [
                {
                  x: 0,
                  y: 620
                },
                {
                  x: 0.5,
                  y: 2800
                },
                {
                  x: 1,
                  y: 2800
                }
              ]
            },
            {
              id: "macro_tone:body_filter:resonance",
              nodeId: "body_filter",
              paramId: "resonance",
              map: "linear",
              min: 0.04,
              max: 0.11,
              points: [
                {
                  x: 0,
                  y: 0.04
                },
                {
                  x: 0.5,
                  y: 0.1
                },
                {
                  x: 1,
                  y: 0.188
                }
              ]
            },
            {
              id: "macro_tone:string1:brightness",
              nodeId: "string1",
              paramId: "brightness",
              map: "linear",
              min: 0.08,
              max: 0.38,
              points: [
                {
                  x: 0,
                  y: 0.08
                },
                {
                  x: 0.5,
                  y: 0.38
                },
                {
                  x: 1,
                  y: 0.32
                }
              ]
            },
            {
              id: "macro_tone:string2:brightness",
              nodeId: "string2",
              paramId: "brightness",
              map: "linear",
              min: 0.045,
              max: 0.28,
              points: [
                {
                  x: 0,
                  y: 0.045
                },
                {
                  x: 0.5,
                  y: 0.28
                },
                {
                  x: 1,
                  y: 0.22
                }
              ]
            },
            {
              id: "macro_tone:string3:brightness",
              nodeId: "string3",
              paramId: "brightness",
              map: "linear",
              min: 0.015,
              max: 0.11,
              points: [
                {
                  x: 0,
                  y: 0.015
                },
                {
                  x: 0.5,
                  y: 0.11
                },
                {
                  x: 1,
                  y: 0.075
                }
              ]
            },
            {
              id: "macro_tone:body_blend:gain1",
              nodeId: "body_blend",
              paramId: "gain1",
              map: "linear",
              min: 0.62,
              max: 0.82,
              points: [
                {
                  x: 0,
                  y: 0.62
                },
                {
                  x: 0.5,
                  y: 0.82
                },
                {
                  x: 1,
                  y: 0.74
                }
              ]
            },
            {
              id: "macro_tone:body_blend:gain2",
              nodeId: "body_blend",
              paramId: "gain2",
              map: "linear",
              min: 0.32,
              max: 0.46,
              points: [
                {
                  x: 0,
                  y: 0.14
                },
                {
                  x: 0.5,
                  y: 0.28
                },
                {
                  x: 1,
                  y: 0.46
                }
              ]
            },
            {
              id: "macro_tone:piano_mix:gain4",
              nodeId: "piano_mix",
              paramId: "gain4",
              map: "linear",
              min: 0.12,
              max: 0.23,
              points: [
                {
                  x: 0,
                  y: 0.14
                },
                {
                  x: 0.5,
                  y: 0.23
                },
                {
                  x: 1,
                  y: 0.12
                }
              ]
            },
            {
              id: "macro_tone:room:mix",
              nodeId: "room",
              paramId: "mix",
              map: "linear",
              min: 0.06,
              max: 0.24,
              points: [
                {
                  x: 0,
                  y: 0.06
                },
                {
                  x: 0.5,
                  y: 0.1
                },
                {
                  x: 1,
                  y: 0.312
                }
              ]
            },
            {
              id: "macro_tone:room:decay",
              nodeId: "room",
              paramId: "decay",
              map: "linear",
              min: 0.16,
              max: 0.36,
              points: [
                {
                  x: 0,
                  y: 0.16
                },
                {
                  x: 0.5,
                  y: 0.22
                },
                {
                  x: 1,
                  y: 0.36
                }
              ]
            },
            {
              id: "macro_tone:room:tone",
              nodeId: "room",
              paramId: "tone",
              map: "linear",
              min: 0.42,
              max: 0.5,
              points: [
                {
                  x: 0,
                  y: 0.42
                },
                {
                  x: 0.5,
                  y: 0.5
                },
                {
                  x: 1,
                  y: 0.294
                }
              ]
            },
            {
              id: "macro_tone:string1:damping",
              nodeId: "string1",
              paramId: "damping",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 0.65
                },
                {
                  x: 1,
                  y: 0.5
                }
              ]
            },
            {
              id: "macro_tone:string2:damping",
              nodeId: "string2",
              paramId: "damping",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 0.65
                },
                {
                  x: 1,
                  y: 0.5
                }
              ]
            },
            {
              id: "macro_tone:string3:damping",
              nodeId: "string3",
              paramId: "damping",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 0.65
                },
                {
                  x: 1,
                  y: 0.5
                }
              ]
            },
            {
              id: "macro_tone:body_blend:gain3",
              nodeId: "body_blend",
              paramId: "gain3",
              map: "linear",
              points: [
                {
                  x: 0,
                  y: 0.35
                },
                {
                  x: 0.5,
                  y: 0.2
                },
                {
                  x: 1,
                  y: 0.1
                }
              ]
            }
          ]
        },
        {
          id: "macro_hammer",
          name: "Hammer",
          keyframeCount: 3,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "macro_hammer:env1:attack",
              nodeId: "env1",
              paramId: "attack",
              map: "linear",
              min: 0,
              max: 12,
              points: [
                {
                  x: 0,
                  y: 12
                },
                {
                  x: 0.5,
                  y: 2
                },
                {
                  x: 1,
                  y: 0
                }
              ]
            },
            {
              id: "macro_hammer:hammer_vca:gain",
              nodeId: "hammer_vca",
              paramId: "gain",
              map: "linear",
              min: 0.035,
              max: 0.72,
              points: [
                {
                  x: 0,
                  y: 0.035
                },
                {
                  x: 0.5,
                  y: 0.18
                },
                {
                  x: 1,
                  y: 0.72
                }
              ]
            },
            {
              id: "macro_hammer:hammer_filter:cutoffHz",
              nodeId: "hammer_filter",
              paramId: "cutoffHz",
              map: "exp",
              min: 950,
              max: 7600,
              points: [
                {
                  x: 0,
                  y: 950
                },
                {
                  x: 0.5,
                  y: 2000
                },
                {
                  x: 1,
                  y: 7600
                }
              ]
            },
            {
              id: "macro_hammer:hammer_filter:resonance",
              nodeId: "hammer_filter",
              paramId: "resonance",
              map: "linear",
              min: 0.18,
              max: 0.42,
              points: [
                {
                  x: 0,
                  y: 0.18
                },
                {
                  x: 0.5,
                  y: 0.32
                },
                {
                  x: 1,
                  y: 0.42
                }
              ]
            },
            {
              id: "macro_hammer:hammer_env:decay",
              nodeId: "hammer_env",
              paramId: "decay",
              map: "linear",
              min: 7,
              max: 34,
              points: [
                {
                  x: 0,
                  y: 34
                },
                {
                  x: 0.5,
                  y: 18.5
                },
                {
                  x: 1,
                  y: 7
                }
              ]
            },
            {
              id: "macro_hammer:hammer_env:release",
              nodeId: "hammer_env",
              paramId: "release",
              map: "linear",
              min: 6,
              max: 24,
              points: [
                {
                  x: 0,
                  y: 24
                },
                {
                  x: 0.5,
                  y: 18
                },
                {
                  x: 1,
                  y: 6
                }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: []
    }
  };
};

export const brassPatch = (): Patch => {
  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_brass",
    name: "Brass-ish",
    meta: { source: "preset", presetId: "preset_brass", presetVersion: 5 },
    nodes: [
      {
        id: "vco1",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "saw",
          pulseWidth: 0.4928,
          baseTuneCents: 0,
          fineTuneCents: -3,
          pwmAmount: 0
        }
      },
      {
        id: "lfo1",
        typeId: "LFO",
        params: {
          ...createDefaultParamsForType("LFO"),
          wave: "sine",
          freqHz: 5.84854,
          pulseWidth: 0.4424,
          bipolar: true
        }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 10.5,
          decay: 930,
          sustain: 0.5,
          release: 180,
          curve: -0.72,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "vcf1",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "lowpass",
          cutoffHz: 360,
          resonance: 0.45,
          cutoffModAmountOct: 3.5
        }
      },
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 1
        }
      },
      {
        id: "transpose_down",
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: -1,
          semitones: 0,
          cents: 0
        }
      },
      {
        id: "vco2",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "square",
          pulseWidth: 0.3408,
          baseTuneCents: 0,
          fineTuneCents: 8.52,
          pwmAmount: 0.39599999999999996
        }
      },
      {
        id: "mix1",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 0.472,
          gain2: 0.4044,
          gain3: 0.42,
          gain4: 1
        }
      },
      {
        id: "env_filter",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 35,
          decay: 280,
          sustain: 0.6032,
          release: 325.6,
          curve: -0.83,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "sat1",
        typeId: "Saturation",
        params: {
          ...createDefaultParamsForType("Saturation"),
          driveDb: 4.5,
          mix: 0.18,
          type: "tanh"
        }
      },
      {
        id: "node_mp2tokon_qd6rm6",
        typeId: "CVScaler",
        params: {
          ...createDefaultParamsForType("CVScaler"),
          scale: 0.013600000000000001
        }
      },
      {
        id: "lfo_pwm",
        typeId: "LFO",
        params: {
          ...createDefaultParamsForType("LFO"),
          wave: "triangle",
          freqHz: 5.84854,
          pulseWidth: 0.4424,
          bipolar: true
        }
      },
      {
        id: "node_mp31mwi7_wzy0gy",
        typeId: "CVScaler",
        params: {
          ...createDefaultParamsForType("CVScaler"),
          scale: 0.3984
        }
      },
      {
        id: "node_mp3hnqig_8x3z7h",
        typeId: "Noise",
        params: {
          ...createDefaultParamsForType("Noise"),
          color: "pink",
          gain: 0.9736
        }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -6, limiter: true })],
    connections: [
      {
        id: "c1",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "pitch"
        }
      },
      {
        id: "c2",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env1",
          portId: "gate"
        }
      },
      {
        id: "c7",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "gainCV"
        }
      },
      {
        id: "c_pitch_down",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "transpose_down",
          portId: "in"
        }
      },
      {
        id: "c_down_to_vco2",
        from: {
          nodeId: "transpose_down",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "pitch"
        }
      },
      {
        id: "c_vco1_mix",
        from: {
          nodeId: "vco1",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in1"
        }
      },
      {
        id: "c_vco2_mix",
        from: {
          nodeId: "vco2",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in2"
        }
      },
      {
        id: "c_gate_filter_env",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env_filter",
          portId: "gate"
        }
      },
      {
        id: "c_filter_env_cutoff",
        from: {
          nodeId: "env_filter",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "cutoffCV"
        }
      },
      {
        id: "c_sat_output",
        from: {
          nodeId: "sat1",
          portId: "out"
        },
        to: {
          nodeId: "output",
          portId: "in"
        }
      },
      {
        id: "conn_mp2too3l_j8qopa",
        from: {
          nodeId: "lfo1",
          portId: "out"
        },
        to: {
          nodeId: "node_mp2tokon_qd6rm6",
          portId: "in"
        }
      },
      {
        id: "conn_mp2topbf_0ng7f5",
        from: {
          nodeId: "node_mp2tokon_qd6rm6",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "fm"
        }
      },
      {
        id: "conn_mp31nb61_sjl8st",
        from: {
          nodeId: "lfo_pwm",
          portId: "out"
        },
        to: {
          nodeId: "node_mp31mwi7_wzy0gy",
          portId: "in"
        }
      },
      {
        id: "conn_mp31p5u2_1qhs5a",
        from: {
          nodeId: "node_mp31mwi7_wzy0gy",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "pwm"
        }
      },
      {
        id: "conn_mp31pa3c_3vd0p0",
        from: {
          nodeId: "node_mp2tokon_qd6rm6",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "fm"
        }
      },
      {
        id: "conn_mp3gubbw_auyuqj",
        from: {
          nodeId: "mix1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "in"
        }
      },
      {
        id: "conn_mp3gug8z_5ap551",
        from: {
          nodeId: "vca1",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "in"
        }
      },
      {
        id: "conn_mp3guhvj_hj0xte",
        from: {
          nodeId: "vcf1",
          portId: "out"
        },
        to: {
          nodeId: "sat1",
          portId: "in"
        }
      },
      {
        id: "conn_mp3hntcz_oomj8s",
        from: {
          nodeId: "node_mp3hnqig_8x3z7h",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in3"
        }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_vibrato_depth",
          name: "Vibrato",
          keyframeCount: 2,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "macro_vibrato_depth:node_mp2tokon_qd6rm6:scale",
              nodeId: "node_mp2tokon_qd6rm6",
              paramId: "scale",
              map: "linear",
              min: 0,
              max: 0.05
            }
          ]
        },
        {
          id: "macro_bite",
          name: "Bite",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_bite:vcf1:cutoffHz",
              nodeId: "vcf1",
              paramId: "cutoffHz",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 180
                },
                {
                  x: 0.5,
                  y: 360
                },
                {
                  x: 1,
                  y: 1350
                }
              ]
            },
            {
              id: "macro_bite:vcf1:cutoffModAmountOct",
              nodeId: "vcf1",
              paramId: "cutoffModAmountOct",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 2.4
                },
                {
                  x: 0.5,
                  y: 3.5
                },
                {
                  x: 1,
                  y: 4.8
                }
              ]
            },
            {
              id: "macro_bite:vcf1:resonance",
              nodeId: "vcf1",
              paramId: "resonance",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.32
                },
                {
                  x: 0.5,
                  y: 0.45
                },
                {
                  x: 1,
                  y: 0.64
                }
              ]
            },
            {
              id: "macro_bite:sat1:driveDb",
              nodeId: "sat1",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1.5
                },
                {
                  x: 0.5,
                  y: 4.5
                },
                {
                  x: 1,
                  y: 20.976
                }
              ]
            },
            {
              id: "macro_bite:sat1:mix",
              nodeId: "sat1",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.08
                },
                {
                  x: 0.5,
                  y: 0.18
                },
                {
                  x: 1,
                  y: 0.682
                }
              ]
            },
            {
              id: "macro_bite:mix1:gain3",
              nodeId: "mix1",
              paramId: "gain3",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.18
                },
                {
                  x: 0.5,
                  y: 0.42
                },
                {
                  x: 1,
                  y: 0.614
                }
              ]
            },
            {
              id: "macro_bite:env_filter:attack",
              nodeId: "env_filter",
              paramId: "attack",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 55
                },
                {
                  x: 0.5,
                  y: 35
                },
                {
                  x: 1,
                  y: 18
                }
              ]
            },
            {
              id: "macro_bite:env_filter:decay",
              nodeId: "env_filter",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 360
                },
                {
                  x: 0.5,
                  y: 280
                },
                {
                  x: 1,
                  y: 190
                }
              ]
            }
          ]
        },
        {
          id: "macro_square_pwm",
          name: "Flare-out",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_square_pwm:vco2:pwmAmount",
              nodeId: "vco2",
              paramId: "pwmAmount",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.04
                },
                {
                  x: 0.5,
                  y: 0.22
                },
                {
                  x: 1,
                  y: 0.42
                }
              ]
            },
            {
              id: "macro_square_pwm:node_mp31mwi7_wzy0gy:scale",
              nodeId: "node_mp31mwi7_wzy0gy",
              paramId: "scale",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.08
                },
                {
                  x: 0.5,
                  y: 0.24
                },
                {
                  x: 1,
                  y: 0.42
                }
              ]
            },
            {
              id: "macro_square_pwm:mix1:gain2",
              nodeId: "mix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.18
                },
                {
                  x: 0.5,
                  y: 0.29
                },
                {
                  x: 1,
                  y: 0.42
                }
              ]
            },
            {
              id: "macro_square_pwm:vco2:pulseWidth",
              nodeId: "vco2",
              paramId: "pulseWidth",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.5
                },
                {
                  x: 0.5,
                  y: 0.42
                },
                {
                  x: 1,
                  y: 0.33
                }
              ]
            },
            {
              id: "macro_square_pwm:vco2:fineTuneCents",
              nodeId: "vco2",
              paramId: "fineTuneCents",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 5
                },
                {
                  x: 1,
                  y: 9
                }
              ]
            },
            {
              id: "macro_square_pwm:node_mp3hnqig_8x3z7h:gain",
              nodeId: "node_mp3hnqig_8x3z7h",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.45
                },
                {
                  x: 0.5,
                  y: 0.78
                },
                {
                  x: 1,
                  y: 1
                }
              ]
            },
            {
              id: "macro_square_pwm:env_filter:sustain",
              nodeId: "env_filter",
              paramId: "sustain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.38
                },
                {
                  x: 0.5,
                  y: 0.48
                },
                {
                  x: 1,
                  y: 0.62
                }
              ]
            },
            {
              id: "macro_square_pwm:env_filter:release",
              nodeId: "env_filter",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 150
                },
                {
                  x: 0.5,
                  y: 220
                },
                {
                  x: 1,
                  y: 340
                }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: []
    }
  };
};

export const drumPatch = (): Patch => {
  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_drumish",
    name: "Drum",
    meta: { source: "preset", presetId: "preset_drumish", presetVersion: 14 },
    nodes: [
      {
        id: "vco1",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "sine",
          pulseWidth: 0.5,
          baseTuneCents: -1700,
          fineTuneCents: 0,
          pwmAmount: 0
        }
      },
      {
        id: "noise1",
        typeId: "Noise",
        params: {
          ...createDefaultParamsForType("Noise"),
          color: "white",
          gain: 1
        }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 210,
          sustain: 0,
          release: 120,
          curve: -0.45,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "env2",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 190,
          sustain: 0,
          release: 125,
          curve: -0.35,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "vcf1",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "bandpass",
          cutoffHz: 11200,
          resonance: 0.34,
          cutoffModAmountOct: 0.08
        }
      },
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.54
        }
      },
      {
        id: "vca2",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.68
        }
      },
      {
        id: "mix1",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 1,
          gain2: 0.40671999999999997,
          gain3: 0.1488,
          gain4: 1
        }
      },
      {
        id: "drive",
        typeId: "Overdrive",
        params: {
          ...createDefaultParamsForType("Overdrive"),
          driveDb: 20.1,
          tone: 0.934,
          mode: "overdrive"
        }
      },
      {
        id: "pitchSnapEnv",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 55,
          sustain: 0,
          release: 18,
          curve: -0.35,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "shellPitchMix",
        typeId: "CVMixer4",
        params: {
          ...createDefaultParamsForType("CVMixer4"),
          gain1: 1,
          gain2: 0.12,
          gain3: 1,
          gain4: 1
        }
      },
      {
        id: "clickEnv",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 9,
          sustain: 0,
          release: 8,
          curve: -0.6,
          mode: "retrigger_from_zero"
        }
      },
      {
        id: "clickFilter",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "highpass",
          cutoffHz: 5200,
          resonance: 0.18,
          cutoffModAmountOct: 0
        }
      },
      {
        id: "clickVca",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.22
        }
      },
      {
        id: "snareComb",
        typeId: "Delay",
        params: {
          ...createDefaultParamsForType("Delay"),
          timeMs: 3.4,
          feedback: 0.17,
          mix: 0.16
        }
      },
      {
        id: "rattleComp",
        typeId: "Compressor",
        params: {
          ...createDefaultParamsForType("Compressor"),
          squash: 0.22,
          attackMs: 45,
          mix: 0.38
        }
      },
      {
        id: "shellPlate",
        typeId: "Reverb",
        params: {
          ...createDefaultParamsForType("Reverb"),
          mode: "plate",
          decay: 0.52,
          tone: 0.68,
          mix: 0.18
        }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: -6, limiter: true })],
    connections: [
      {
        id: "c2",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env1",
          portId: "gate"
        }
      },
      {
        id: "c3",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env2",
          portId: "gate"
        }
      },
      {
        id: "c4",
        from: {
          nodeId: "vco1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "in"
        }
      },
      {
        id: "c5",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "gainCV"
        }
      },
      {
        id: "c6",
        from: {
          nodeId: "noise1",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "in"
        }
      },
      {
        id: "c7",
        from: {
          nodeId: "env2",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "cutoffCV"
        }
      },
      {
        id: "c8",
        from: {
          nodeId: "vcf1",
          portId: "out"
        },
        to: {
          nodeId: "vca2",
          portId: "in"
        }
      },
      {
        id: "c9",
        from: {
          nodeId: "env2",
          portId: "out"
        },
        to: {
          nodeId: "vca2",
          portId: "gainCV"
        }
      },
      {
        id: "c12",
        from: {
          nodeId: "mix1",
          portId: "out"
        },
        to: {
          nodeId: "drive",
          portId: "in"
        }
      },
      {
        id: "c13",
        from: {
          nodeId: "drive",
          portId: "out"
        },
        to: {
          nodeId: "output",
          portId: "in"
        }
      },
      {
        id: "c_pitch_note_to_mix",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "shellPitchMix",
          portId: "in1"
        }
      },
      {
        id: "c_gate_to_pitchsnap",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "pitchSnapEnv",
          portId: "gate"
        }
      },
      {
        id: "c_pitchsnap_to_mix",
        from: {
          nodeId: "pitchSnapEnv",
          portId: "out"
        },
        to: {
          nodeId: "shellPitchMix",
          portId: "in2"
        }
      },
      {
        id: "c_pitchmix_to_vco",
        from: {
          nodeId: "shellPitchMix",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "pitch"
        }
      },
      {
        id: "c_noise_to_clickfilter",
        from: {
          nodeId: "noise1",
          portId: "out"
        },
        to: {
          nodeId: "clickFilter",
          portId: "in"
        }
      },
      {
        id: "c_gate_to_clickenv",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "clickEnv",
          portId: "gate"
        }
      },
      {
        id: "c_clickfilter_to_vca",
        from: {
          nodeId: "clickFilter",
          portId: "out"
        },
        to: {
          nodeId: "clickVca",
          portId: "in"
        }
      },
      {
        id: "c_clickenv_to_clickvca",
        from: {
          nodeId: "clickEnv",
          portId: "out"
        },
        to: {
          nodeId: "clickVca",
          portId: "gainCV"
        }
      },
      {
        id: "c_clickvca_to_mix",
        from: {
          nodeId: "clickVca",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in3"
        }
      },
      {
        id: "c_rattle_vca_to_comb",
        from: {
          nodeId: "vca2",
          portId: "out"
        },
        to: {
          nodeId: "snareComb",
          portId: "in"
        }
      },
      {
        id: "c_comb_to_rattleComp",
        from: {
          nodeId: "snareComb",
          portId: "out"
        },
        to: {
          nodeId: "rattleComp",
          portId: "in"
        }
      },
      {
        id: "c_rattleComp_to_mix",
        from: {
          nodeId: "rattleComp",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in2"
        }
      },
      {
        id: "c_shell_vca_to_plate",
        from: {
          nodeId: "vca1",
          portId: "out"
        },
        to: {
          nodeId: "shellPlate",
          portId: "in"
        }
      },
      {
        id: "c_shell_plate_to_mix",
        from: {
          nodeId: "shellPlate",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in1"
        }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_shell",
          name: "Shell / Head Tightness",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_shell:env1:decay",
              nodeId: "env1",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 38
                },
                {
                  x: 0.5,
                  y: 124
                },
                {
                  x: 1,
                  y: 210
                }
              ]
            },
            {
              id: "macro_shell:env1:release",
              nodeId: "env1",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 12
                },
                {
                  x: 0.5,
                  y: 66
                },
                {
                  x: 1,
                  y: 120
                }
              ]
            },
            {
              id: "macro_shell:vca1:gain",
              nodeId: "vca1",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.56
                },
                {
                  x: 0.5,
                  y: 0.35
                },
                {
                  x: 1,
                  y: 0.54
                }
              ]
            },
            {
              id: "macro_shell:pitchSnapEnv:decay",
              nodeId: "pitchSnapEnv",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 12
                },
                {
                  x: 0.5,
                  y: 33.5
                },
                {
                  x: 1,
                  y: 55
                }
              ]
            },
            {
              id: "macro_shell:shellPitchMix:gain2",
              nodeId: "shellPitchMix",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.5
                },
                {
                  x: 0.5,
                  y: 0.31
                },
                {
                  x: 1,
                  y: 0.12
                }
              ]
            },
            {
              id: "macro_shell:vco1:baseTuneCents",
              nodeId: "vco1",
              paramId: "baseTuneCents",
              map: "linear",
              min: -2700,
              max: -1700,
              points: [
                {
                  x: 0,
                  y: -2700
                },
                {
                  x: 0.5,
                  y: -2200
                },
                {
                  x: 1,
                  y: -1700
                }
              ]
            },
            {
              id: "macro_shell:shellPlate:mix",
              nodeId: "shellPlate",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.045
                },
                {
                  x: 1,
                  y: 0.18
                }
              ]
            },
            {
              id: "macro_shell:shellPlate:decay",
              nodeId: "shellPlate",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.18
                },
                {
                  x: 0.5,
                  y: 0.32
                },
                {
                  x: 1,
                  y: 0.52
                }
              ]
            },
            {
              id: "macro_shell:shellPlate:tone",
              nodeId: "shellPlate",
              paramId: "tone",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.48
                },
                {
                  x: 0.5,
                  y: 0.6
                },
                {
                  x: 1,
                  y: 0.68
                }
              ]
            }
          ]
        },
        {
          id: "macro_shell_level",
          name: "Shell Level",
          keyframeCount: 2,
          bindings: [
            {
              id: "macro_shell_level:mix1:gain1",
              nodeId: "mix1",
              paramId: "gain1",
              map: "linear",
              min: 0.18,
              max: 1
            }
          ]
        },
        {
          id: "macro_rattle",
          name: "Rattle / Snare Wires",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_rattle:vca2:gain",
              nodeId: "vca2",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0
                },
                {
                  x: 0.5,
                  y: 0.92
                },
                {
                  x: 1,
                  y: 0.68
                }
              ]
            },
            {
              id: "macro_rattle:env2:decay",
              nodeId: "env2",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 18
                },
                {
                  x: 0.5,
                  y: 168
                },
                {
                  x: 1,
                  y: 190
                }
              ]
            },
            {
              id: "macro_rattle:env2:release",
              nodeId: "env2",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 6
                },
                {
                  x: 0.5,
                  y: 56
                },
                {
                  x: 1,
                  y: 125
                }
              ]
            },
            {
              id: "macro_rattle:vcf1:cutoffHz",
              nodeId: "vcf1",
              paramId: "cutoffHz",
              map: "exp",
              min: 20,
              max: 20000,
              points: [
                {
                  x: 0,
                  y: 5000
                },
                {
                  x: 0.5,
                  y: 7600
                },
                {
                  x: 1,
                  y: 11200
                }
              ]
            },
            {
              id: "macro_rattle:vcf1:resonance",
              nodeId: "vcf1",
              paramId: "resonance",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.78
                },
                {
                  x: 0.5,
                  y: 0.84
                },
                {
                  x: 1,
                  y: 0.34
                }
              ]
            },
            {
              id: "macro_rattle:snareComb:feedback",
              nodeId: "snareComb",
              paramId: "feedback",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.045
                },
                {
                  x: 0.5,
                  y: 0.11
                },
                {
                  x: 1,
                  y: 0.17
                }
              ]
            },
            {
              id: "macro_rattle:snareComb:mix",
              nodeId: "snareComb",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.035
                },
                {
                  x: 0.5,
                  y: 0.13
                },
                {
                  x: 1,
                  y: 0.16
                }
              ]
            },
            {
              id: "macro_rattle:drive:driveDb",
              nodeId: "drive",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 24,
              points: [
                {
                  x: 0,
                  y: 2.5
                },
                {
                  x: 0.5,
                  y: 3.8
                },
                {
                  x: 1,
                  y: 20.1
                }
              ]
            },
            {
              id: "macro_rattle:rattleComp:squash",
              nodeId: "rattleComp",
              paramId: "squash",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.08
                },
                {
                  x: 0.5,
                  y: 0.62
                },
                {
                  x: 1,
                  y: 0.22
                }
              ]
            },
            {
              id: "macro_rattle:rattleComp:attackMs",
              nodeId: "rattleComp",
              paramId: "attackMs",
              map: "linear",
              min: 10,
              max: 600,
              points: [
                {
                  x: 0,
                  y: 28
                },
                {
                  x: 0.5,
                  y: 10
                },
                {
                  x: 1,
                  y: 45
                }
              ]
            },
            {
              id: "macro_rattle:rattleComp:mix",
              nodeId: "rattleComp",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.2
                },
                {
                  x: 0.5,
                  y: 0.78
                },
                {
                  x: 1,
                  y: 0.38
                }
              ]
            }
          ]
        },
        {
          id: "macro_rattle_level",
          name: "Rattle Level",
          keyframeCount: 2,
          bindings: [
            {
              id: "macro_rattle_level:mix1:gain2",
              nodeId: "mix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 0.82
            },
            {
              id: "macro_rattle_level:mix1:gain3",
              nodeId: "mix1",
              paramId: "gain3",
              map: "linear",
              min: 0,
              max: 0.3
            }
          ]
        }
      ]
    },
    layout: {
      nodes: []
    }
  };
};

export const bassDrumPatch = (): Patch => {
  return {
    schemaVersion: CURRENT_PATCH_SCHEMA_VERSION,
    id: "preset_bass_drum",
    name: "Bass Drum",
    meta: { source: "preset", presetId: "preset_bass_drum", presetVersion: 1 },
    nodes: [
      {
        id: "vco1",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "sine",
          pulseWidth: 0.5,
          baseTuneCents: -3000,
          fineTuneCents: 0,
          pwmAmount: 0
        }
      },
      {
        id: "cvtranspose1",
        typeId: "CVTranspose",
        params: {
          ...createDefaultParamsForType("CVTranspose"),
          octaves: -1,
          semitones: 0,
          cents: 0
        }
      },
      {
        id: "vco2",
        typeId: "VCO",
        params: {
          ...createDefaultParamsForType("VCO"),
          wave: "sine",
          pulseWidth: 0.5,
          baseTuneCents: -3000,
          fineTuneCents: 0,
          pwmAmount: 0
        }
      },
      {
        id: "noise1",
        typeId: "Noise",
        params: {
          ...createDefaultParamsForType("Noise"),
          color: "white",
          gain: 1
        }
      },
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 112,
          sustain: 0,
          release: 39,
          curve: 0,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "env2",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 28,
          sustain: 0,
          release: 10,
          curve: 0,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "vcf1",
        typeId: "VCF",
        params: {
          ...createDefaultParamsForType("VCF"),
          type: "bandpass",
          cutoffHz: 2100,
          resonance: 0.09,
          cutoffModAmountOct: 0.16
        }
      },
      {
        id: "mix0",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 1,
          gain2: 0.92,
          gain3: 0,
          gain4: 1
        }
      },
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.96
        }
      },
      {
        id: "vca2",
        typeId: "VCA",
        params: {
          ...createDefaultParamsForType("VCA"),
          bias: 0,
          gain: 0.19
        }
      },
      {
        id: "mix1",
        typeId: "Mixer4",
        params: {
          ...createDefaultParamsForType("Mixer4"),
          gain1: 1,
          gain2: 0.255,
          gain3: 0,
          gain4: 1
        }
      },
      {
        id: "drive",
        typeId: "Overdrive",
        params: {
          ...createDefaultParamsForType("Overdrive"),
          driveDb: 18,
          tone: 0.48,
          mode: "overdrive"
        }
      },
      {
        id: "env_pitch",
        typeId: "ADSR",
        params: {
          ...createDefaultParamsForType("ADSR"),
          attack: 0,
          decay: 34,
          sustain: 0,
          release: 8,
          curve: -0.15,
          mode: "retrigger_from_current"
        }
      },
      {
        id: "pitch_snap_amt",
        typeId: "CVScaler",
        params: {
          ...createDefaultParamsForType("CVScaler"),
          scale: 0.115
        }
      },
      {
        id: "beater_room",
        typeId: "Reverb",
        params: {
          ...createDefaultParamsForType("Reverb"),
          mode: "room",
          decay: 0.2,
          tone: 0.48,
          mix: 0.045
        }
      },
      {
        id: "beater_soften_hall",
        typeId: "Reverb",
        params: {
          ...createDefaultParamsForType("Reverb"),
          mode: "hall",
          decay: 0.566,
          tone: 0.474,
          mix: 0.522
        }
      }
    ],
    ports: [createPatchOutputPort({ gainDb: 6, limiter: true })],
    connections: [
      {
        id: "c1",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "pitch"
        }
      },
      {
        id: "c1a",
        from: {
          nodeId: "$host.pitch",
          portId: "out"
        },
        to: {
          nodeId: "cvtranspose1",
          portId: "in"
        }
      },
      {
        id: "c1b",
        from: {
          nodeId: "cvtranspose1",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "pitch"
        }
      },
      {
        id: "c2",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env1",
          portId: "gate"
        }
      },
      {
        id: "c3",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env2",
          portId: "gate"
        }
      },
      {
        id: "c4",
        from: {
          nodeId: "vco1",
          portId: "out"
        },
        to: {
          nodeId: "mix0",
          portId: "in1"
        }
      },
      {
        id: "c4b",
        from: {
          nodeId: "vco2",
          portId: "out"
        },
        to: {
          nodeId: "mix0",
          portId: "in2"
        }
      },
      {
        id: "c4c",
        from: {
          nodeId: "mix0",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "in"
        }
      },
      {
        id: "c5",
        from: {
          nodeId: "env1",
          portId: "out"
        },
        to: {
          nodeId: "vca1",
          portId: "gainCV"
        }
      },
      {
        id: "c7",
        from: {
          nodeId: "env2",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "cutoffCV"
        }
      },
      {
        id: "c8",
        from: {
          nodeId: "vcf1",
          portId: "out"
        },
        to: {
          nodeId: "vca2",
          portId: "in"
        }
      },
      {
        id: "c9",
        from: {
          nodeId: "env2",
          portId: "out"
        },
        to: {
          nodeId: "vca2",
          portId: "gainCV"
        }
      },
      {
        id: "c10",
        from: {
          nodeId: "vca1",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in1"
        }
      },
      {
        id: "c12",
        from: {
          nodeId: "mix1",
          portId: "out"
        },
        to: {
          nodeId: "drive",
          portId: "in"
        }
      },
      {
        id: "c13",
        from: {
          nodeId: "drive",
          portId: "out"
        },
        to: {
          nodeId: "output",
          portId: "in"
        }
      },
      {
        id: "c_pitch_gate",
        from: {
          nodeId: "$host.gate",
          portId: "out"
        },
        to: {
          nodeId: "env_pitch",
          portId: "gate"
        }
      },
      {
        id: "c_pitch_env_scale",
        from: {
          nodeId: "env_pitch",
          portId: "out"
        },
        to: {
          nodeId: "pitch_snap_amt",
          portId: "in"
        }
      },
      {
        id: "c_pitch_snap_vco1",
        from: {
          nodeId: "pitch_snap_amt",
          portId: "out"
        },
        to: {
          nodeId: "vco1",
          portId: "fm"
        }
      },
      {
        id: "c_pitch_snap_vco2",
        from: {
          nodeId: "pitch_snap_amt",
          portId: "out"
        },
        to: {
          nodeId: "vco2",
          portId: "fm"
        }
      },
      {
        id: "c11a_beater_to_room",
        from: {
          nodeId: "vca2",
          portId: "out"
        },
        to: {
          nodeId: "beater_room",
          portId: "in"
        }
      },
      {
        id: "c11b_room_to_mix",
        from: {
          nodeId: "beater_room",
          portId: "out"
        },
        to: {
          nodeId: "mix1",
          portId: "in2"
        }
      },
      {
        id: "c_noise_to_beater_soften_hall",
        from: {
          nodeId: "noise1",
          portId: "out"
        },
        to: {
          nodeId: "beater_soften_hall",
          portId: "in"
        }
      },
      {
        id: "conn_mp56r7xc_iq9qgw",
        from: {
          nodeId: "beater_soften_hall",
          portId: "out"
        },
        to: {
          nodeId: "vcf1",
          portId: "in"
        }
      }
    ],
    ui: {
      macros: [
        {
          id: "macro_drive",
          name: "Pressure",
          keyframeCount: 3,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "macro_drive:drive:driveDb",
              nodeId: "drive",
              paramId: "driveDb",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 10
                },
                {
                  x: 0.5,
                  y: 18
                },
                {
                  x: 1,
                  y: 27
                }
              ]
            },
            {
              id: "macro_drive:drive:tone",
              nodeId: "drive",
              paramId: "tone",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.38
                },
                {
                  x: 0.5,
                  y: 0.48
                },
                {
                  x: 1,
                  y: 0.58
                }
              ]
            },
            {
              id: "macro_drive:pitch_snap_amt:scale",
              nodeId: "pitch_snap_amt",
              paramId: "scale",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.055
                },
                {
                  x: 0.5,
                  y: 0.115
                },
                {
                  x: 1,
                  y: 0.18
                }
              ]
            },
            {
              id: "macro_drive:env_pitch:decay",
              nodeId: "env_pitch",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 24
                },
                {
                  x: 0.5,
                  y: 34
                },
                {
                  x: 1,
                  y: 48
                }
              ]
            },
            {
              id: "macro_drive:mix0:gain1",
              nodeId: "mix0",
              paramId: "gain1",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.92
                },
                {
                  x: 0.5,
                  y: 1
                },
                {
                  x: 1,
                  y: 1
                }
              ]
            },
            {
              id: "macro_drive:vca1:gain",
              nodeId: "vca1",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.9
                },
                {
                  x: 0.5,
                  y: 0.96
                },
                {
                  x: 1,
                  y: 1
                }
              ]
            }
          ]
        },
        {
          id: "macro_body",
          name: "Body",
          keyframeCount: 3,
          defaultNormalized: 0.5,
          bindings: [
            {
              id: "macro_body:env1:decay",
              nodeId: "env1",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 55
                },
                {
                  x: 0.5,
                  y: 112
                },
                {
                  x: 1,
                  y: 178
                }
              ]
            },
            {
              id: "macro_body:env1:release",
              nodeId: "env1",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 18
                },
                {
                  x: 0.5,
                  y: 39
                },
                {
                  x: 1,
                  y: 70
                }
              ]
            },
            {
              id: "macro_body:mix0:gain2",
              nodeId: "mix0",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.72
                },
                {
                  x: 0.5,
                  y: 0.92
                },
                {
                  x: 1,
                  y: 0.93
                }
              ]
            },
            {
              id: "macro_body:mix1:gain2",
              nodeId: "mix1",
              paramId: "gain2",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.2
                },
                {
                  x: 0.5,
                  y: 0.255
                },
                {
                  x: 1,
                  y: 0.22
                }
              ]
            }
          ]
        },
        {
          id: "macro_click",
          name: "Beater Material",
          keyframeCount: 3,
          bindings: [
            {
              id: "macro_click:vca2:gain",
              nodeId: "vca2",
              paramId: "gain",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.075
                },
                {
                  x: 0.5,
                  y: 0.19
                },
                {
                  x: 1,
                  y: 0.37
                }
              ]
            },
            {
              id: "macro_click:env2:decay",
              nodeId: "env2",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 120
                },
                {
                  x: 0.5,
                  y: 28
                },
                {
                  x: 1,
                  y: 7
                }
              ]
            },
            {
              id: "macro_click:env2:release",
              nodeId: "env2",
              paramId: "release",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 26
                },
                {
                  x: 0.5,
                  y: 10
                },
                {
                  x: 1,
                  y: 3
                }
              ]
            },
            {
              id: "macro_click:vcf1:cutoffHz",
              nodeId: "vcf1",
              paramId: "cutoffHz",
              map: "exp",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 620
                },
                {
                  x: 0.5,
                  y: 2100
                },
                {
                  x: 1,
                  y: 7800
                }
              ]
            },
            {
              id: "macro_click:vcf1:cutoffModAmountOct",
              nodeId: "vcf1",
              paramId: "cutoffModAmountOct",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.02
                },
                {
                  x: 0.5,
                  y: 0.16
                },
                {
                  x: 1,
                  y: 0.48
                }
              ]
            },
            {
              id: "macro_click:vcf1:resonance",
              nodeId: "vcf1",
              paramId: "resonance",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.04
                },
                {
                  x: 0.5,
                  y: 0.09
                },
                {
                  x: 1,
                  y: 0.11
                }
              ]
            },
            {
              id: "macro_click:beater_room:decay",
              nodeId: "beater_room",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.1
                },
                {
                  x: 0.5,
                  y: 0.2
                },
                {
                  x: 1,
                  y: 0.3
                }
              ]
            },
            {
              id: "macro_click:beater_room:tone",
              nodeId: "beater_room",
              paramId: "tone",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.24
                },
                {
                  x: 0.5,
                  y: 0.48
                },
                {
                  x: 1,
                  y: 0.78
                }
              ]
            },
            {
              id: "macro_click:beater_room:mix",
              nodeId: "beater_room",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 0.018
                },
                {
                  x: 0.5,
                  y: 0.045
                },
                {
                  x: 1,
                  y: 0.18
                }
              ]
            },
            {
              id: "macro_click:beater_soften_hall:decay",
              nodeId: "beater_soften_hall",
              paramId: "decay",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 0.566
                },
                {
                  x: 1,
                  y: 0
                }
              ]
            },
            {
              id: "macro_click:beater_soften_hall:mix",
              nodeId: "beater_soften_hall",
              paramId: "mix",
              map: "linear",
              min: 0,
              max: 1,
              points: [
                {
                  x: 0,
                  y: 1
                },
                {
                  x: 0.5,
                  y: 0.522
                },
                {
                  x: 1,
                  y: 0
                }
              ]
            }
          ]
        }
      ]
    },
    layout: {
      nodes: []
    }
  };
};

export const presetPatches = [
  bassPatch(),
  brassPatch(),
  keysPatch(),
  padPatch(),
  guitarStringPatch(),
  drumPatch(),
  bassDrumPatch()
].map(normalizeMacroBindingIds);

// Build a fresh default project from the checked-in song template while always
// sourcing preset patches from the latest bundled definitions. Preset layouts
// are intentionally omitted here and resolved by auto-layout when hydrated.
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
