"use client";

import { RefObject } from "react";
import { AudioEngine } from "@/audio/engine";
import { ContentSelection } from "@/lib/clipboard";
import { Project, Track } from "@/types/music";

export type WorkspaceView = "composer" | "patch-workspace";

export interface ActiveKeyboardPlacement {
  noteId: string;
  trackId: string;
  startBeat: number;
  durationBeats: number;
  startedAtMs: number;
  pitchStr: string;
  triggerKey: string;
  tracksDefaultPitch: boolean;
}

export interface GhostPreviewNote {
  trackId: string;
  startBeat: number;
  durationBeats: number;
  pitchStr: string;
  anchorPlayheadBeat: number;
}

export interface UseHardwareNavigationArgs {
  view: WorkspaceView;
  projectGridBeats: number;
  projectTempo: number;
  tracks: Track[];
  selectedTrack?: Track;
  playheadBeat: number;
  playbackEndBeat: number;
  isPlaying: boolean;
  recordPhase: "idle" | "count_in" | "recording";
  pitchPickerOpen: boolean;
  previewPitchPickerOpen: boolean;
  defaultPitch: string;
  selectionKind: "none" | "content" | "timeline";
  contentSelection: ContentSelection;
  selectionActionPopoverCollapsed: boolean;
  setDefaultPitch: (pitch: string) => void;
  setSelectedTrackId: (trackId: string) => void;
  setPlayheadBeatFromUser: (beat: number) => void;
  setPlayheadBeatPreservingSelection: (beat: number) => void;
  setContentSelection: (selection: ContentSelection, options?: { keepCollapsed?: boolean }) => void;
  expandSelectionActionPopover: () => void;
  toggleTrackMacroPanel: (trackId: string, expanded: boolean) => void;
  deleteNote: (trackId: string, noteId: string) => void;
  commitProjectChange: (
    updater: (current: Project) => Project,
    options?: { actionKey?: string; coalesce?: boolean }
  ) => void;
  audioEngineRef: RefObject<AudioEngine | null>;
  previewDefaultPitchNow: (pitch?: string) => void;
  releaseHeldDefaultPitchPreview: () => void;
  startHeldDefaultPitchPreview: (pitch?: string) => void;
  onComposerPlay: () => void;
  onComposerStop: () => void;
  setRuntimeError: (message: string | null) => void;
}

export interface HardwareNavigationResult {
  activePlacement: ActiveKeyboardPlacement | null;
  ghostPreviewNote: GhostPreviewNote | null;
  tabSelectionPreviewNote: { trackId: string; noteId: string } | null;
  playheadNavigationFocused: boolean;
  selectedContentTabStopFocusToken: number;
  returnSelectionFocusToPlayhead: () => void;
}
