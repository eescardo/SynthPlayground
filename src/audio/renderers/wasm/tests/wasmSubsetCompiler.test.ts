import { describe, expect, it } from "vitest";

import { compileAudioProjectToWasmSubset, compileSchedulerEventsToWasmSubset } from "@/audio/renderers/wasm/wasmSubsetCompiler";
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
      ports: [{ id: "out", typeId: "Output", label: "output", params: { gainDb: 0, limiter: false } }],
      connections: [
        { id: "c1", from: { nodeId: "vcf", portId: "out" }, to: { nodeId: "out", portId: "in" } }
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
                id: "binding_cutoff",
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
                id: "binding_resonance",
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
      layout: { nodes: [] },
      io: { audioOutNodeId: "out", audioOutPortId: "in" }
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

    const compiled = compileAudioProjectToWasmSubset(project, { blockSize: 128 });
    const vcfNode = compiled.tracks[0]?.nodes.find((node) => node.id === "vcf");

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
        { id: "osc", typeId: "VCO", params: { wave: "sine", pulseWidth: 0.5, baseTuneCents: 0, fineTuneCents: 0, pwmAmount: 0 } },
        { id: "env", typeId: "ADSR", params: { attack: 0, decay: 0.1, sustain: 0, release: 0.1, mode: "retrigger_from_current" } },
        { id: "amp", typeId: "VCA", params: { gain: 1, bias: 0 } }
      ],
      ports: [{ id: "out", typeId: "Output", label: "output", params: { gainDb: -3, limiter: true } }],
      connections: [
        { id: "c1", from: { nodeId: "$host.pitch", portId: "out" }, to: { nodeId: "transpose", portId: "in" } },
        { id: "c2", from: { nodeId: "transpose", portId: "out" }, to: { nodeId: "osc", portId: "pitch" } },
        { id: "c3", from: { nodeId: "$host.gate", portId: "out" }, to: { nodeId: "env", portId: "gate" } },
        { id: "c4", from: { nodeId: "osc", portId: "out" }, to: { nodeId: "amp", portId: "in" } },
        { id: "c5", from: { nodeId: "env", portId: "out" }, to: { nodeId: "amp", portId: "gainCV" } },
        { id: "c6", from: { nodeId: "amp", portId: "out" }, to: { nodeId: "out", portId: "in" } }
      ],
      ui: { macros: [] },
      layout: { nodes: [] },
      io: { audioOutNodeId: "out", audioOutPortId: "in" }
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

    const compiled = compileAudioProjectToWasmSubset(project, { blockSize: 128 });
    const track = compiled.tracks[0]!;
    const transposeNode = track.nodes.find((node) => node.id === "transpose");
    const oscNode = track.nodes.find((node) => node.id === "osc");
    const envNode = track.nodes.find((node) => node.id === "env");
    const outputPort = track.nodes.find((node) => node.id === "out");

    expect(transposeNode?.inputs.in).toBe(track.hostSignalIndices.pitch);
    expect(oscNode?.inputs.pitch).toBe(transposeNode?.outIndex);
    expect(envNode?.inputs.gate).toBe(track.hostSignalIndices.gate);
    expect(outputPort?.typeId).toBe("Output");
    expect(outputPort?.params.gainDb).toBe(-3);
    expect(outputPort?.params.limiter).toBe(true);
  });

  it("rejects legacy Output nodes in the compiler", () => {
    const patch: Patch = {
      schemaVersion: 1,
      id: "legacy-output-node",
      name: "Legacy Output Node",
      meta: { source: "custom" },
      nodes: [
        { id: "output", typeId: "Output", params: { gainDb: -3, limiter: true } }
      ],
      ports: [],
      connections: [],
      ui: { macros: [] },
      layout: { nodes: [] },
      io: { audioOutNodeId: "output", audioOutPortId: "in" }
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

    expect(() => compileAudioProjectToWasmSubset(project, { blockSize: 128 })).toThrow("Output must be declared as a patch port");
  });
});
