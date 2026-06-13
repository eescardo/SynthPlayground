import { describe, expect, it } from "vitest";

import {
  compileAudioProjectPlanToWasmSubset,
  compileAudioProjectToWasmSubset,
  compileSchedulerEventsToWasmSubset
} from "@/audio/renderers/wasm/wasmSubsetCompiler";
import { createPatchOutputPort, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import type { AudioProject } from "@/types/audio";
import type { Patch } from "@/types/patch";

describe("compileAudioProjectToWasmSubset", () => {
  it("applies keyframed macro bindings after changing interpolation map", () => {
    const patch: Patch = {
      schemaVersion: 1,
      id: "macro-points",
      name: "Macro Points",
      meta: { source: "custom" },
      nodes: [
        { id: "vcf", typeId: "VCF", params: { type: "lowpass", cutoffHz: 120, resonance: 0.2, cutoffModAmountOct: 0 } }
      ],
      ports: [createPatchOutputPort({ gainDb: 0, limiter: false })],
      connections: [
        { id: "c1", from: { nodeId: "vcf", portId: "out" }, to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" } }
      ],
      ui: {
        macros: [
          {
            id: "macro_filter",
            name: "Filter",
            keyframeCount: 3,
            defaultNormalized: 0.25,
            bindings: [
              {
                nodeId: "vcf",
                paramId: "cutoffHz",
                map: "linear",
                points: [
                  { x: 0, y: 100 },
                  { x: 0.5, y: 1000 },
                  { x: 1, y: 10000 }
                ]
              },
              {
                nodeId: "vcf",
                paramId: "resonance",
                map: "exp",
                points: [
                  { x: 0, y: 0.1 },
                  { x: 0.5, y: 0.4 },
                  { x: 1, y: 0.9 }
                ]
              }
            ]
          }
        ]
      },
      layout: { nodes: [] }
    };

    const project: AudioProject = {
      global: { sampleRate: 48000, tempo: 120, meter: "4/4", gridBeats: 0.25, loop: [] },
      tracks: [
        {
          id: "track1",
          name: "Track 1",
          instrumentPatchId: patch.id,
          notes: [],
          macroValues: {},
          macroAutomations: {},
          macroPanelExpanded: false,
          volume: 1,
          pan: 0.25,
          mute: false,
          solo: false,
          fx: {
            delayEnabled: false,
            reverbEnabled: false,
            saturationEnabled: false,
            compressorEnabled: false,
            delayMix: 0,
            reverbMix: 0,
            drive: 0,
            compression: 0
          }
        }
      ],
      patches: [patch],
      masterFx: {
        compressorEnabled: false,
        limiterEnabled: false,
        makeupGain: 0
      }
    };

    const compiled = compileAudioProjectToWasmSubset({ project }, { blockSize: 128 });
    const vcfNode = compiled.tracks[0]?.nodes.find((node) => node.id === "vcf");

    expect(compiled.tracks[0]?.pan).toBe(0.25);
    expect(vcfNode?.params.cutoffHz).toBeCloseTo(550);
    expect(vcfNode?.params.resonance).toBeCloseTo(Math.sqrt(0.1 * 0.4));

    const compiledEvents = compileSchedulerEventsToWasmSubset(project, compiled, [
      {
        id: "macro_change",
        type: "MacroChange",
        sampleTime: 64,
        source: "preview",
        trackId: "track1",
        macroId: "macro_filter",
        normalized: 0.25
      }
    ]);
    expect(
      compileSchedulerEventsToWasmSubset(project, compiled, [
        {
          id: "pan_change",
          type: "MacroChange",
          sampleTime: 96,
          source: "automation",
          trackId: "track1",
          macroId: "__track_pan__",
          normalized: 0.8
        }
      ])
    ).toEqual([
      {
        type: "TrackPanChange",
        sampleTime: 96,
        trackIndex: 0,
        value: 0.8
      }
    ]);
    expect(compiledEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ParamChange",
          nodeId: "vcf",
          paramId: "cutoffHz",
          value: expect.closeTo(550)
        }),
        expect.objectContaining({
          type: "ParamChange",
          nodeId: "vcf",
          paramId: "resonance",
          value: expect.closeTo(Math.sqrt(0.1 * 0.4))
        })
      ])
    );
  });

  it("preserves explicit host-node routing when compiling track patches", () => {
    const patch: Patch = {
      schemaVersion: 1,
      id: "host-routing",
      name: "Host Routing",
      meta: { source: "custom" },
      nodes: [
        { id: "transpose", typeId: "CVTranspose", params: { octaves: -1, semitones: 0, cents: 0 } },
        {
          id: "osc",
          typeId: "VCO",
          params: { wave: "sine", pulseWidth: 0.5, baseTuneCents: 0, fineTuneCents: 0, pwmAmount: 0 }
        },
        {
          id: "env",
          typeId: "ADSR",
          params: { attack: 0, decay: 100, sustain: 0, release: 100, mode: "retrigger_from_current" }
        },
        { id: "amp", typeId: "VCA", params: { gain: 1, bias: 0 } }
      ],
      ports: [createPatchOutputPort({ gainDb: -3, limiter: true })],
      connections: [
        { id: "c1", from: { nodeId: "$host.pitch", portId: "out" }, to: { nodeId: "transpose", portId: "in" } },
        { id: "c2", from: { nodeId: "transpose", portId: "out" }, to: { nodeId: "osc", portId: "pitch" } },
        { id: "c3", from: { nodeId: "$host.gate", portId: "out" }, to: { nodeId: "env", portId: "gate" } },
        { id: "c4", from: { nodeId: "osc", portId: "out" }, to: { nodeId: "amp", portId: "in" } },
        { id: "c5", from: { nodeId: "env", portId: "out" }, to: { nodeId: "amp", portId: "gainCV" } },
        { id: "c6", from: { nodeId: "amp", portId: "out" }, to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" } }
      ],
      ui: { macros: [] },
      layout: { nodes: [] }
    };

    const project: AudioProject = {
      global: { sampleRate: 48000, tempo: 120, meter: "4/4", gridBeats: 0.25, loop: [] },
      tracks: [
        {
          id: "track1",
          name: "Track 1",
          instrumentPatchId: patch.id,
          notes: [],
          macroValues: {},
          macroAutomations: {},
          macroPanelExpanded: false,
          volume: 1,
          pan: 0.5,
          mute: false,
          solo: false,
          fx: {
            delayEnabled: false,
            reverbEnabled: false,
            saturationEnabled: false,
            compressorEnabled: false,
            delayMix: 0,
            reverbMix: 0,
            drive: 0,
            compression: 0
          }
        }
      ],
      patches: [patch],
      masterFx: {
        compressorEnabled: false,
        limiterEnabled: false,
        makeupGain: 0
      }
    };

    const compiled = compileAudioProjectToWasmSubset({ project }, { blockSize: 128 });
    const track = compiled.tracks[0]!;
    const transposeNode = track.nodes.find((node) => node.id === "transpose");
    const oscNode = track.nodes.find((node) => node.id === "osc");
    const envNode = track.nodes.find((node) => node.id === "env");
    const outputPort = track.nodes.find((node) => node.id === PATCH_OUTPUT_PORT_ID);

    expect(transposeNode?.inputs.in).toBe(track.hostSignalIndices.pitch);
    expect(oscNode?.inputs.pitch).toBe(transposeNode?.outIndex);
    expect(envNode?.inputs.gate).toBe(track.hostSignalIndices.gate);
    expect(outputPort?.typeId).toBe("Output");
    expect(outputPort?.params.gainDb).toBe(-3);
    expect(outputPort?.params.limiter).toBe(true);
  });

  it("collects sample player assets from runtime sidecar without embedding intrinsic params", () => {
    const patch: Patch = {
      schemaVersion: 1,
      id: "sample-sidecar",
      name: "Sample Sidecar",
      meta: { source: "custom" },
      nodes: [
        {
          id: "sample",
          typeId: "SamplePlayer",
          params: { sampleAssetId: "asset_1", rootPitch: "C5", start: 0, end: 1 }
        }
      ],
      ports: [createPatchOutputPort({ gainDb: 0, limiter: false })],
      connections: [
        { id: "c1", from: { nodeId: "sample", portId: "out" }, to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" } }
      ],
      ui: { macros: [] },
      layout: { nodes: [] }
    };

    const project: AudioProject = {
      global: { sampleRate: 48000, tempo: 120, meter: "4/4", gridBeats: 0.25, loop: [] },
      tracks: [
        {
          id: "track1",
          name: "Track 1",
          instrumentPatchId: patch.id,
          notes: [],
          macroValues: {},
          macroAutomations: {},
          macroPanelExpanded: false,
          volume: 1,
          pan: 0.5,
          mute: false,
          solo: false,
          fx: {
            delayEnabled: false,
            reverbEnabled: false,
            saturationEnabled: false,
            compressorEnabled: false,
            delayMix: 0,
            reverbMix: 0,
            drive: 0,
            compression: 0
          }
        }
      ],
      patches: [patch],
      masterFx: {
        compressorEnabled: false,
        limiterEnabled: false,
        makeupGain: 0
      }
    };
    const runtimeAssets = {
      samplePlayerById: {
        asset_1: {
          version: 2 as const,
          name: "sample.wav",
          sampleRate: 44100,
          samples: new Float32Array([0, 0.25, -0.25])
        }
      }
    };

    const plan = compileAudioProjectPlanToWasmSubset({ project, runtimeAssets }, { blockSize: 128 });

    expect(
      plan.projectSpec.tracks[0]?.nodes.find((node) => node.id === "sample")?.params.sampleAssetId
    ).toBeUndefined();
    expect(plan.sampleAssetsByTrack[0]).toEqual([
      {
        nodeId: "sample",
        sampleRate: 44100,
        samples: runtimeAssets.samplePlayerById.asset_1.samples
      }
    ]);

    const projectWithLegacyEmbeddedAssets = { ...project, sampleAssets: runtimeAssets };
    const planWithoutSidecar = compileAudioProjectPlanToWasmSubset(
      { project: projectWithLegacyEmbeddedAssets },
      { blockSize: 128 }
    );
    expect(planWithoutSidecar.sampleAssetsByTrack[0]).toEqual([]);
  });

  it("rejects Output nodes in the compiler", () => {
    const patch: Patch = {
      schemaVersion: 1,
      id: "invalid-output-node",
      name: "Invalid Output Node",
      meta: { source: "custom" },
      nodes: [{ id: "output", typeId: "Output", params: { gainDb: -3, limiter: true } }],
      ports: [],
      connections: [],
      ui: { macros: [] },
      layout: { nodes: [] }
    };

    const project: AudioProject = {
      global: { sampleRate: 48000, tempo: 120, meter: "4/4", gridBeats: 0.25, loop: [] },
      tracks: [
        {
          id: "track1",
          name: "Track 1",
          instrumentPatchId: patch.id,
          notes: [],
          macroValues: {},
          macroAutomations: {},
          macroPanelExpanded: false,
          volume: 1,
          pan: 0.5,
          mute: false,
          solo: false,
          fx: {
            delayEnabled: false,
            reverbEnabled: false,
            saturationEnabled: false,
            compressorEnabled: false,
            delayMix: 0,
            reverbMix: 0,
            drive: 0,
            compression: 0
          }
        }
      ],
      patches: [patch],
      masterFx: {
        compressorEnabled: false,
        limiterEnabled: false,
        makeupGain: 0
      }
    };

    expect(() => compileAudioProjectToWasmSubset({ project }, { blockSize: 128 })).toThrow(
      "Output must be declared as a patch port"
    );
  });
});
