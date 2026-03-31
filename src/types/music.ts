// Core song/composition structures used by UI editing, transport, and project persistence.
import { Patch } from "@/types/patch";

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

export interface Track {
  id: string;
  name: string;
  instrumentPatchId: string;
  notes: Note[];
  macroValues: Record<string, number>;
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

export interface Project {
  id: string;
  name: string;
  global: ProjectGlobalSettings;
  tracks: Track[];
  patches: Patch[];
  masterFx: MasterFxSettings;
  createdAt: number;
  updatedAt: number;
}

export interface TransportState {
  isPlaying: boolean;
  playheadBeat: number;
  recordEnabled: boolean;
  selectedTrackId?: string;
}
