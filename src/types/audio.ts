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
  pitchVoct: number;
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
}

export interface WorkletSetProjectMessage {
  type: "SET_PROJECT";
  project: unknown;
}

export interface WorkletEventsMessage {
  type: "EVENTS";
  events: SchedulerEvent[];
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
}

export interface WorkletTransportMessage {
  type: "TRANSPORT";
  isPlaying: boolean;
  songStartSample: number;
  events?: SchedulerEvent[];
  sessionId?: number;
}

export interface WorkletRecordingMessage {
  type: "RECORDING";
  trackId: string | null;
}

export type WorkletInboundMessage =
  | WorkletInitMessage
  | WorkletSetProjectMessage
  | WorkletEventsMessage
  | WorkletMacroMessage
  | WorkletPreviewMessage
  | WorkletRecordingMessage
  | WorkletTransportMessage;
