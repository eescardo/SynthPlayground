import { AutomationKeyframeSide } from "@/lib/macroAutomation";
import { Note, Project } from "@/types/music";

export type SelectionBeatRange = { startBeat: number; endBeat: number; beatSpan: number };

export type TrackCanvasSelection =
  | { kind: "none" }
  | {
      kind: "note";
      selectedNoteKeys: ReadonlySet<string>;
      beatRange: SelectionBeatRange;
      label: string;
      markerTrackId: string;
    }
  | {
      kind: "timeline";
      beatRange: SelectionBeatRange;
      label: string;
      markerTrackId: string;
    };

export interface TimelineActionsPopoverRequest {
  beat: number;
  clientX: number;
  clientY: number;
}

export interface TrackCanvasTrackActions {
  onSelectTrack: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onToggleTrackMute: (trackId: string) => void;
  onSetTrackVolume: (trackId: string, volume: number, options?: { commit?: boolean }) => void;
  onPreviewTrackVolume: (trackId: string, volume: number) => void;
  onBindTrackVolumeToAutomation: (trackId: string, initialValue: number) => void;
  onUnbindTrackVolumeFromAutomation: (trackId: string) => void;
  onToggleTrackVolumeAutomationLane: (trackId: string) => void;
  onUpdateTrackPatch: (trackId: string, patchId: string) => void;
  onToggleTrackMacroPanel: (trackId: string) => void;
}

export interface TrackCanvasAutomationActions {
  onChangeTrackMacro: (trackId: string, macroId: string, normalized: number, options?: { commit?: boolean }) => void;
  onBindTrackMacroToAutomation: (trackId: string, macroId: string, normalized: number) => void;
  onUnbindTrackMacroFromAutomation: (trackId: string, macroId: string) => void;
  onToggleTrackMacroAutomationLane: (trackId: string, macroId: string) => void;
  onUpsertTrackMacroAutomationKeyframe: (
    trackId: string,
    macroId: string,
    beat: number,
    value: number,
    options?: { keyframeId?: string; commit?: boolean }
  ) => void;
  onSplitTrackMacroAutomationKeyframe: (trackId: string, macroId: string, keyframeId: string) => void;
  onUpdateTrackMacroAutomationKeyframeSide: (
    trackId: string,
    macroId: string,
    keyframeId: string,
    side: AutomationKeyframeSide,
    value: number,
    options?: { commit?: boolean }
  ) => void;
  onDeleteTrackMacroAutomationKeyframeSide: (
    trackId: string,
    macroId: string,
    keyframeId: string,
    side: AutomationKeyframeSide
  ) => void;
  onPreviewTrackMacroAutomation: (trackId: string, macroId: string, normalized: number, options?: { retrigger?: boolean }) => void;
}

export interface TrackCanvasNoteActions {
  onOpenPitchPicker: (trackId: string, noteId: string) => void;
  onPreviewPlacedNote: (trackId: string, note: Note) => void;
  onUpsertNote: (trackId: string, note: Note, options?: { actionKey?: string; coalesce?: boolean }) => void;
  onUpdateNote: (trackId: string, noteId: string, patch: Partial<Note>, options?: { actionKey?: string; coalesce?: boolean }) => void;
  onDeleteNote: (trackId: string, noteId: string) => void;
}

export interface TrackCanvasSelectionActions {
  onSetNoteSelection: (selectionKeys: string[]) => void;
  onSetTimelineSelectionBeatRange: (range: SelectionBeatRange | null) => void;
  onSetSelectionMarqueeActive: (active: boolean) => void;
  onPreviewSelectionActionScopeChange: (scope: "source" | "all-tracks") => void;
  selectionActionPopoverCollapsed?: boolean;
  onExpandSelectionActionPopover?: () => void;
  onDismissSelectionActionPopover?: () => void;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onDeleteSelection: () => void;
  onCopyAllTracksInSelection: () => void;
  onCutAllTracksInSelection: () => void;
  onDeleteAllTracksInSelection: () => void;
}

export interface TrackCanvasProps {
  project: Project;
  invalidPatchIds?: Set<string>;
  selectedTrackId?: string;
  playheadBeat: number;
  activeRecordedNotes?: Array<{ trackId: string; noteId: string; startBeat: number }>;
  ghostPlayheadBeat?: number;
  countInLabel?: string;
  timelineActionsPopoverOpen?: boolean;
  selection: TrackCanvasSelection;
  hideSelectionActionPopover?: boolean;
  onSetPlayheadBeat: (beat: number) => void;
  onRequestTimelineActionsPopover: (request: TimelineActionsPopoverRequest) => void;
  trackActions: TrackCanvasTrackActions;
  automationActions: TrackCanvasAutomationActions;
  noteActions: TrackCanvasNoteActions;
  selectionActions: TrackCanvasSelectionActions;
}

export interface AutomationLaneLayout {
  laneId: string;
  laneType: "macro" | "volume";
  macroId: string | null;
  name: string;
  y: number;
  height: number;
  expanded: boolean;
  automated: boolean;
}

export interface TrackLayout {
  trackId: string;
  index: number;
  y: number;
  height: number;
  automationLanes: AutomationLaneLayout[];
}
