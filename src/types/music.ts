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
  mute?: boolean;
  solo?: boolean;
  fx: TrackFxSettings;
}

export interface ProjectGlobalSettings {
  sampleRate: 48000;
  tempo: number;
  meter: "4/4" | "3/4";
  gridBeats: number;
  loop?: {
    startBeat: number;
    endBeat: number;
    enabled: boolean;
  };
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
