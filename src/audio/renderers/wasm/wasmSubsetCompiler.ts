import { AudioProject, SchedulerEvent } from "@/types/audio";
import {
  compileAudioProjectToWasmSubsetCore,
  compileSchedulerEventsToWasmSubsetCore
} from "@/audio/renderers/wasm/synth-worklet-wasm-compiler-core.js";

// Planning surface for the WASM backend.
//
// The Rust engine does not consume the editor-facing project model directly.
// Before rendering begins, we lower that rich patch/event model into a simpler
// numeric runtime spec:
// - tracks receive stable indices
// - nodes are ordered topologically
// - ports are resolved to integer signal indices
// - initial parameter values and macro-expanded values are materialized
// - scheduled events are rewritten into the smaller event schema the engine uses
//
// This module is the typed TypeScript-facing entry point to that planning step.
// It does not allocate voice buffers or render audio; it prepares the execution
// plan that a SynthRenderer/SynthRenderStream will hand to the Rust/WASM engine.

export interface WasmTrackFxSpec {
  delayEnabled: boolean;
  reverbEnabled: boolean;
  saturationEnabled: boolean;
  compressorEnabled: boolean;
  delayMix: number;
  reverbMix: number;
  drive: number;
  compression: number;
}

export interface WasmMasterFxSpec {
  compressorEnabled: boolean;
  limiterEnabled: boolean;
  makeupGain: number;
}

export interface WasmNodeSpec {
  id: string;
  typeId:
    | "CVTranspose"
    | "CVScaler"
    | "CVMixer2"
    | "VCO"
    | "KarplusStrong"
    | "LFO"
    | "ADSR"
    | "VCA"
    | "VCF"
    | "Mixer4"
    | "Noise"
    | "SamplePlayer"
    | "Delay"
    | "Reverb"
    | "Saturation"
    | "Overdrive"
    | "Compressor"
    | "Output";
  outIndex: number;
  inputs: Record<string, number>;
  params: Record<string, number | string | boolean>;
}

export interface WasmTrackSpec {
  trackIndex: number;
  trackId: string;
  volume: number;
  mute: boolean;
  fx: WasmTrackFxSpec;
  signalCount: number;
  hostSignalIndices: {
    pitch: number;
    gate: number;
    velocity: number;
    modWheel: number;
  };
  outputSignalIndex: number;
  nodes: WasmNodeSpec[];
}

export interface WasmProjectSpec {
  sampleRate: number;
  blockSize: number;
  tracks: WasmTrackSpec[];
  masterFx: WasmMasterFxSpec;
}

export interface WasmNoteOnEvent {
  type: "NoteOn";
  sampleTime: number;
  trackIndex: number;
  noteId: string;
  pitchVoct: number;
  velocity: number;
}

export interface WasmNoteOffEvent {
  type: "NoteOff";
  sampleTime: number;
  trackIndex: number;
  noteId: string;
}

export interface WasmParamChangeEvent {
  type: "ParamChange";
  sampleTime: number;
  trackIndex: number;
  nodeId: string;
  paramId: string;
  value: number | string | boolean;
}

export interface WasmTrackVolumeChangeEvent {
  type: "TrackVolumeChange";
  sampleTime: number;
  trackIndex: number;
  value: number;
}

export type WasmEvent = WasmNoteOnEvent | WasmNoteOffEvent | WasmParamChangeEvent | WasmTrackVolumeChangeEvent;

// Convert the app-level AudioProject into the planned numeric layout that the
// WASM backend executes. Think of this as producing the render plan, not the
// audio output: node order, signal addressing, parameter layout, and per-track
// metadata are all resolved here so the runtime can stay cheap.
export const compileAudioProjectToWasmSubset = (
  project: AudioProject,
  options: { blockSize: number }
): WasmProjectSpec => compileAudioProjectToWasmSubsetCore(project, options) as WasmProjectSpec;

export const compileSchedulerEventsToWasmSubset = (
  project: AudioProject,
  projectSpec: WasmProjectSpec,
  events: SchedulerEvent[]
): WasmEvent[] => compileSchedulerEventsToWasmSubsetCore(project, projectSpec, events) as WasmEvent[];
