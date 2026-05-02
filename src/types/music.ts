// Core song/composition structures used by UI editing, transport, and project persistence.
import { Patch } from "@/types/patch";
import { PatchWorkspaceProbeState } from "@/types/probes";

export interface Note {
  id: string;
  pitchStr: string;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface TrackFxSettings {
  delayEnabled: boolean;
  reverbEnabled: boolean;
  saturationEnabled: boolean;
  compressorEnabled: boolean;
  delayMix: number;
  reverbMix: number;
  drive: number;
  compression: number;
}

export interface WholeTrackMacroAutomationKeyframe {
  id: string;
  beat: number;
  type: "whole";
  value: number;
}

export interface SplitTrackMacroAutomationKeyframe {
  id: string;
  beat: number;
  type: "split";
  incomingValue: number;
  outgoingValue: number;
}

export type TrackMacroAutomationKeyframe = WholeTrackMacroAutomationKeyframe | SplitTrackMacroAutomationKeyframe;

export interface TrackMacroAutomationLane {
  macroId: string;
  expanded: boolean;
  startValue: number;
  endValue: number;
  keyframes: TrackMacroAutomationKeyframe[];
}

export interface Track {
  id: string;
  name: string;
  instrumentPatchId: string;
  notes: Note[];
  macroValues: Record<string, number>;
  macroAutomations: Record<string, TrackMacroAutomationLane>;
  macroPanelExpanded: boolean;
  volume: number;
  mute?: boolean;
  solo?: boolean;
  fx: TrackFxSettings;
}

export interface ProjectGlobalSettings {
  sampleRate: 48000;
  tempo: number;
  meter: "4/4" | "3/4";
  gridBeats: number;
  loop: Array<{
    id: string;
    kind: "start" | "end";
    beat: number;
    repeatCount?: number;
  }>;
}

export interface MasterFxSettings {
  compressorEnabled: boolean;
  limiterEnabled: boolean;
  makeupGain: number;
}

export interface PatchWorkspaceTabState {
  id: string;
  name: string;
  patchId: string;
  baselinePatch?: Patch;
  selectedNodeId?: string;
  selectedMacroId?: string;
  selectedProbeId?: string;
  probes: PatchWorkspaceProbeState[];
}

export interface PatchWorkspaceUiState {
  activeTabId?: string;
  tabs: PatchWorkspaceTabState[];
}

export interface ProjectUiState {
  patchWorkspace: PatchWorkspaceUiState;
}

export interface ProjectGlobalCarrier {
  global: ProjectGlobalSettings;
}

export interface Project {
  id: string;
  name: string;
  global: ProjectGlobalSettings;
  tracks: Track[];
  patches: Patch[];
  masterFx: MasterFxSettings;
  ui: ProjectUiState;
  createdAt: number;
  updatedAt: number;
}

export interface TransportState {
  isPlaying: boolean;
  playheadBeat: number;
  recordEnabled: boolean;
  selectedTrackId?: string;
}
