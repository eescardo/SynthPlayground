import { MasterFxSettings, ProjectGlobalSettings, Track } from "@/types/music";
import { Patch } from "@/types/patch";
import { ProjectAssetLibrary } from "@/types/assets";
import type { SerializableSproutError } from "@/lib/sproutErrors";
import { PreviewProbeCapture, PreviewProbeRequest, PreviewProbeSharedBuffer } from "@/types/probes";

export interface AudioProject {
  global: ProjectGlobalSettings;
  tracks: Track[];
  patches: Patch[];
  masterFx: MasterFxSettings;
}

export interface SynthRendererConfig {
  sampleRate: number;
  blockSize: number;
  project?: AudioProject;
  runtimeAssets?: ProjectAssetLibrary;
}

export type SynthRenderMode = "transport" | "preview";

export interface BaseSynthStreamStartOptions {
  project: AudioProject;
  runtimeAssets?: ProjectAssetLibrary;
  songStartSample: number;
  events: SchedulerEvent[];
  mode: SynthRenderMode;
  sessionId?: number;
  randomSeed?: number;
}

export interface TransportSynthStreamStartOptions extends BaseSynthStreamStartOptions {
  mode: "transport";
}

export interface PreviewSynthStreamStartOptions extends BaseSynthStreamStartOptions {
  mode: "preview";
  durationSamples: number;
  captureDurationSamples?: number;
  trackId: string;
  ignoreVolume?: boolean;
  previewId?: string;
  captureProbes?: PreviewProbeRequest[];
  captureSharedBuffers?: PreviewProbeSharedBuffer[];
}

export type SynthStreamStartOptions = TransportSynthStreamStartOptions | PreviewSynthStreamStartOptions;

export type TransportCommand =
  | {
      type: "SetTrackMute";
      trackId: string;
      muted: boolean;
    }
  | {
      type: "SetTrackVolume";
      trackId: string;
      normalized: number;
    };

// Scheduler/worklet message contracts and event payload types for audio transport.
export type SchedulerEventType = "NoteOn" | "NoteOff" | "ParamChange" | "MacroChange";
export type SchedulerEventSource = "timeline" | "live_input" | "preview" | "automation";

export interface BaseSchedulerEvent {
  id: string;
  type: SchedulerEventType;
  sampleTime: number;
  source: SchedulerEventSource;
}

export interface NoteOnEvent extends BaseSchedulerEvent {
  type: "NoteOn";
  trackId: string;
  pitchVoct: number;
  velocity: number;
  noteId: string;
}

export interface NoteOffEvent extends BaseSchedulerEvent {
  type: "NoteOff";
  trackId: string;
  noteId: string;
}

export interface ParamChangeEvent extends BaseSchedulerEvent {
  type: "ParamChange";
  patchId: string;
  nodeId: string;
  paramId: string;
  value: number | string | boolean;
}

export interface MacroChangeEvent extends BaseSchedulerEvent {
  type: "MacroChange";
  trackId: string;
  macroId: string;
  normalized: number;
}

export type SchedulerEvent = NoteOnEvent | NoteOffEvent | ParamChangeEvent | MacroChangeEvent;

export interface WorkletInitMessage {
  type: "INIT";
  sampleRate: number;
  blockSize: number;
  wasmBytes?: ArrayBuffer;
}

export interface WorkletSetProjectMessage {
  type: "SET_PROJECT";
  project: AudioProject;
  runtimeAssets?: ProjectAssetLibrary;
}

export interface WorkletEventsMessage {
  type: "EVENTS";
  events: SchedulerEvent[];
  sessionId?: number;
}

export interface WorkletTransportCommandMessage {
  type: "TRANSPORT_COMMAND";
  command: TransportCommand;
  sessionId?: number;
}

export interface WorkletMacroMessage {
  type: "MACRO";
  trackId: string;
  macroId: string;
  normalized: number;
}

export interface WorkletPreviewMessage {
  type: "PREVIEW";
  events: SchedulerEvent[];
  durationSamples: number;
  captureDurationSamples?: number;
  trackId: string;
  project?: AudioProject;
  runtimeAssets?: ProjectAssetLibrary;
  ignoreVolume?: boolean;
  previewId?: string;
  captureProbes?: PreviewProbeRequest[];
  captureSharedBuffers?: PreviewProbeSharedBuffer[];
  randomSeed?: number;
}

export interface WorkletPreviewReleaseMessage {
  type: "PREVIEW_RELEASE";
  trackId: string;
  previewId: string;
  forceStop?: boolean;
}

export interface WorkletPreviewCaptureMessage {
  type: "PREVIEW_CAPTURE";
  previewId?: string;
  captures: PreviewProbeCapture[];
}

export interface WorkletInitReadyMessage {
  type: "INIT_READY";
}

export interface WorkletInitErrorMessage {
  type: "INIT_ERROR";
  error: string;
}

export interface WorkletRuntimeErrorMessage {
  type: "RUNTIME_ERROR";
  phase: "message" | "start_stream" | "stop_stream" | "process_block";
  error: string;
  sproutError: SerializableSproutError;
}

export interface WorkletTransportMessage {
  type: "TRANSPORT";
  isPlaying: boolean;
  songStartSample: number;
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
  runtimeAssets?: ProjectAssetLibrary;
}

export interface WorkletRecordingMessage {
  type: "RECORDING";
  trackId: string | null;
}

export type WorkletInboundMessage =
  | WorkletInitMessage
  | WorkletSetProjectMessage
  | WorkletEventsMessage
  | WorkletTransportCommandMessage
  | WorkletMacroMessage
  | WorkletPreviewMessage
  | WorkletPreviewReleaseMessage
  | WorkletRecordingMessage
  | WorkletTransportMessage;

export type WorkletOutboundMessage =
  | WorkletPreviewCaptureMessage
  | WorkletInitReadyMessage
  | WorkletInitErrorMessage
  | WorkletRuntimeErrorMessage;
