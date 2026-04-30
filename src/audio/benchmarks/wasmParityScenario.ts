import { AudioProject } from "@/types/audio";
import { Patch } from "@/types/patch";
import { Track } from "@/types/music";
import { createPatchOutputPort } from "@/lib/patch/ports";

export interface WasmParityScenarioConfig {
  id: string;
  name: string;
  trackCount: number;
  durationBeats: number;
  tempo: number;
  meter: "4/4" | "3/4";
  gridBeats: number;
  blockSize: number;
  sampleRate: 48000;
  noteSpacingBeats: number;
  noteDurationBeats: number;
}

export interface WasmParityScenario {
  config: WasmParityScenarioConfig;
  project: AudioProject;
}

const createParityPatch = (): Patch => ({
  schemaVersion: 1,
  id: "wasm_subset_patch",
  name: "WASM Subset Patch",
  meta: { source: "custom" },
  nodes: [
    { id: "osc", typeId: "VCO", params: { wave: "square", pulseWidth: 0.5, baseTuneCents: 0, fineTuneCents: 0, pwmAmount: 0 } },
    { id: "env", typeId: "ADSR", params: { attack: 2, decay: 80, sustain: 0.65, release: 80, mode: "retrigger_from_current" } },
    { id: "amp", typeId: "VCA", params: { bias: 0, gain: 1 } }
  ],
  ports: [createPatchOutputPort({ gainDb: 0, limiter: false })],
  connections: [
    { id: "c1", from: { nodeId: "osc", portId: "out" }, to: { nodeId: "amp", portId: "in" } },
    { id: "c2", from: { nodeId: "env", portId: "out" }, to: { nodeId: "amp", portId: "gainCV" } },
    { id: "c3", from: { nodeId: "amp", portId: "out" }, to: { nodeId: "output", portId: "in" } }
  ],
  ui: { macros: [] },
  layout: { nodes: [] }
});

const createTrack = (trackIndex: number, config: WasmParityScenarioConfig): Track => {
  const notes = [];
  for (let beat = (trackIndex % 4) * 0.25; beat < config.durationBeats - 1e-9; beat += config.noteSpacingBeats) {
    notes.push({
      id: `note_${trackIndex + 1}_${notes.length + 1}`,
      pitchStr: "C4",
      startBeat: Number(beat.toFixed(3)),
      durationBeats: config.noteDurationBeats,
      velocity: 1
    });
  }
  return {
    id: `track_${trackIndex + 1}`,
    name: `Track ${trackIndex + 1}`,
    instrumentPatchId: "wasm_subset_patch",
    notes,
    macroValues: {},
    macroAutomations: {},
    macroPanelExpanded: false,
    volume: 0.125,
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
  };
};

export const createWasmParityScenario = (overrides: Partial<WasmParityScenarioConfig> = {}): WasmParityScenario => {
  const config: WasmParityScenarioConfig = {
    id: "wasm-parity-medium",
    name: "WASM parity medium subset",
    trackCount: 8,
    durationBeats: 96,
    tempo: 120,
    meter: "4/4",
    gridBeats: 0.25,
    blockSize: 128,
    sampleRate: 48000,
    noteSpacingBeats: 1,
    noteDurationBeats: 0.5,
    ...overrides
  };
  const patch = createParityPatch();
  return {
    config,
    project: {
      global: {
        sampleRate: config.sampleRate,
        tempo: config.tempo,
        meter: config.meter,
        gridBeats: config.gridBeats,
        loop: []
      },
      tracks: Array.from({ length: config.trackCount }, (_, trackIndex) => createTrack(trackIndex, config)),
      patches: [patch],
      masterFx: {
        compressorEnabled: false,
        limiterEnabled: false,
        makeupGain: 0
      }
    }
  };
};
