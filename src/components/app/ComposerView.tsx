"use client";

import type { ComponentProps, RefObject } from "react";
import type { ComposerRecordPhase } from "@/components/composer/ComposerActionsBar";
import { QuickHelpDialog } from "@/components/QuickHelpDialog";
import { ComposerActionsBar } from "@/components/composer/ComposerActionsBar";
import { TimelineActionsPopover } from "@/components/TimelineActionsPopover";
import { TimelineActionsPopoverRequest, TrackCanvas, TrackCanvasSelection } from "@/components/tracks/TrackCanvas";
import { TransportBar } from "@/components/TransportBar";
import { RecentProjectSnapshot } from "@/lib/persistence";
import { useComposerQuickHelpDialog } from "@/hooks/useComposerQuickHelpDialog";
import { usePlatformShortcuts } from "@/hooks/usePlatformShortcuts";
import { Project } from "@/types/music";

export interface ComposerViewProps {
  project: Project;
  selectedTrackId: string;
  defaultPitch: string;
  invalidPatchIds: Set<string>;
  canvasSelection: TrackCanvasSelection;
  projectMenu: ComposerProjectMenuProps;
  transport: ComposerTransportProps;
  recording: ComposerRecordingProps;
  canvasPreview: ComposerCanvasPreviewProps;
  timeline: ComposerTimelineProps;
  projectActions: ComposerProjectActions;
  transportActions: ComposerTransportActions;
  timelineActions: ComposerTimelineActions;
  trackActions: ComponentProps<typeof TrackCanvas>["trackActions"];
  patchActions: ComponentProps<typeof TrackCanvas>["patchActions"];
  automationActions: ComponentProps<typeof TrackCanvas>["automationActions"];
  noteActions: ComponentProps<typeof TrackCanvas>["noteActions"];
  selectionActions: ComponentProps<typeof TrackCanvas>["selectionActions"];
}

export interface ComposerProjectMenuProps {
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  onNewProject: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
}

export interface ComposerTransportProps {
  playheadBeat: number;
  exportingAudio: boolean;
}

export interface ComposerRecordingProps {
  activeRecordedNotes: Array<{ trackId: string; noteId: string; startBeat: number }>;
  recordingDisabled: boolean;
  isPlaying: boolean;
  recordEnabled: boolean;
  recordPhase?: ComposerRecordPhase;
  ghostPlayheadBeat?: number;
  countInLabel?: string;
}

export interface ComposerCanvasPreviewProps {
  keyboardPlacementNote?: { trackId: string; noteId: string } | null;
  ghostPreviewNote?: { trackId: string; startBeat: number; durationBeats: number; pitchStr: string } | null;
  tabSelectionPreviewNote?: { trackId: string; noteId: string } | null;
  playheadFocused?: boolean;
  selectedContentTabStopFocusToken?: number;
  selectionActionPopoverVisible: boolean;
}

export interface ComposerTimelineProps {
  timelineActionsPopover: TimelineActionsPopoverRequest | null;
  noteClipboardPayload: unknown;
  startMarkerAtTimelineBeat?: { id: string } | null;
  endMarkerAtTimelineBeat?: { id: string; repeatCount?: number } | null;
  expandableLoopRegion: boolean;
}

export interface ComposerProjectActions {
  onClearCurrentProject: () => void;
  onRenameProject: (name: string) => void;
  onOpenDefaultPitchPicker: () => void;
  onOpenPatchWorkspace: () => void;
  onExportAudio: () => void;
  onTempoChange: (tempo: number) => void;
  onMeterChange: (meter: Project["global"]["meter"]) => void;
  onGridChange: (gridBeats: number) => void;
  onAddTrack: () => void;
  onRemoveTrack: () => void;
  onSetPlayheadBeat: (beat: number) => void;
  onReturnSelectedNoteFocusToPlayhead: () => void;
}

export interface ComposerTransportActions {
  onPlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
}

export interface ComposerTimelineActions {
  onRequestTimelineActionsPopover: (request: TimelineActionsPopoverRequest) => void;
  onCloseTimelineActionsPopover: () => void;
  onPasteAtTimeline: (mode: "paste" | "paste-all-tracks" | "insert" | "insert-all-tracks", beat: number) => void;
  onAddLoopBoundary: (beat: number, kind: "start" | "end") => void;
  onExpandLoopToNotes: () => void;
  onUpdateLoopRepeatCount: (repeatCount: number) => void;
  onRemoveStartLoopBoundary: () => void;
  onRemoveEndLoopBoundary: () => void;
}

export function ComposerView(props: ComposerViewProps) {
  const { allTracksModifierLabel, deleteKeyLabel, primaryModifierLabel } = usePlatformShortcuts();
  const { closeHelp, helpOpen, keyboardShortcutSections, mouseHelpItems, openHelp } = useComposerQuickHelpDialog({
    allTracksModifierLabel,
    deleteKeyLabel,
    primaryModifierLabel
  });

  return (
    <>
      <TransportBar
        projectName={props.project.name}
        tempo={props.project.global.tempo}
        meter={props.project.global.meter}
        gridBeats={props.project.global.gridBeats}
        playheadBeat={props.transport.playheadBeat}
        importInputRef={props.projectMenu.importInputRef}
        recentProjects={props.projectMenu.recentProjects}
        onRenameProject={props.projectActions.onRenameProject}
        onNewProject={props.projectMenu.onNewProject}
        onOpenPatchWorkspace={props.projectActions.onOpenPatchWorkspace}
        onExportAudio={props.projectActions.onExportAudio}
        exportAudioDisabled={props.transport.exportingAudio}
        onTempoChange={props.projectActions.onTempoChange}
        onMeterChange={props.projectActions.onMeterChange}
        onGridChange={props.projectActions.onGridChange}
        onExportJson={props.projectMenu.onExportJson}
        onImportJson={props.projectMenu.onImportJson}
        onOpenRecentProject={props.projectMenu.onOpenRecentProject}
        onResetToDefaultProject={props.projectMenu.onResetToDefaultProject}
        onImportFile={props.projectMenu.onImportFile}
        onOpenHelp={openHelp}
      />

      <ComposerActionsBar
        recordingDisabled={props.recording.recordingDisabled}
        isPlaying={props.recording.isPlaying}
        recordEnabled={props.recording.recordEnabled}
        recordPhase={props.recording.recordPhase}
        countInLabel={props.recording.countInLabel}
        defaultPitch={props.defaultPitch}
        canRemoveTrack={props.project.tracks.length > 1}
        onOpenDefaultPitchPicker={props.projectActions.onOpenDefaultPitchPicker}
        onPlay={props.transportActions.onPlay}
        onStop={props.transportActions.onStop}
        onToggleRecord={props.transportActions.onToggleRecord}
        onClearProject={props.projectActions.onClearCurrentProject}
        onAddTrack={props.projectActions.onAddTrack}
        onRemoveTrack={props.projectActions.onRemoveTrack}
      />

      <TrackCanvas
        project={props.project}
        invalidPatchIds={props.invalidPatchIds}
        selectedTrackId={props.selectedTrackId}
        defaultPitch={props.defaultPitch}
        selection={props.canvasSelection}
        playheadBeat={props.transport.playheadBeat}
        activeRecordedNotes={props.recording.activeRecordedNotes}
        keyboardPlacementNote={props.canvasPreview.keyboardPlacementNote}
        ghostPreviewNote={props.canvasPreview.ghostPreviewNote}
        tabSelectionPreviewNote={props.canvasPreview.tabSelectionPreviewNote}
        playheadFocused={props.canvasPreview.playheadFocused}
        selectedContentTabStopFocusToken={props.canvasPreview.selectedContentTabStopFocusToken}
        ghostPlayheadBeat={props.recording.ghostPlayheadBeat}
        countInLabel={props.recording.countInLabel}
        timelineActionsPopoverOpen={Boolean(props.timeline.timelineActionsPopover)}
        hideSelectionActionPopover={!props.canvasPreview.selectionActionPopoverVisible}
        onSetPlayheadBeat={props.projectActions.onSetPlayheadBeat}
        onReturnSelectedNoteFocusToPlayhead={props.projectActions.onReturnSelectedNoteFocusToPlayhead}
        onRequestTimelineActionsPopover={props.timelineActions.onRequestTimelineActionsPopover}
        trackActions={props.trackActions}
        patchActions={props.patchActions}
        automationActions={props.automationActions}
        noteActions={props.noteActions}
        selectionActions={props.selectionActions}
      />

      {props.timeline.timelineActionsPopover && (
        <TimelineActionsPopover
          left={props.timeline.timelineActionsPopover.clientX}
          top={props.timeline.timelineActionsPopover.clientY + 12}
          showPasteActions={Boolean(props.timeline.noteClipboardPayload)}
          showAddStart={!props.timeline.startMarkerAtTimelineBeat}
          showAddEnd={props.timeline.timelineActionsPopover.beat > 0 && !props.timeline.endMarkerAtTimelineBeat}
          showExpandLoopToNotes={props.timeline.expandableLoopRegion}
          startMarkerId={props.timeline.startMarkerAtTimelineBeat?.id}
          endMarkerId={props.timeline.endMarkerAtTimelineBeat?.id}
          endRepeatCount={props.timeline.endMarkerAtTimelineBeat?.repeatCount}
          onPaste={() => props.timelineActions.onPasteAtTimeline("paste", props.timeline.timelineActionsPopover!.beat)}
          onPasteAllTracks={() =>
            props.timelineActions.onPasteAtTimeline("paste-all-tracks", props.timeline.timelineActionsPopover!.beat)
          }
          onInsert={() =>
            props.timelineActions.onPasteAtTimeline("insert", props.timeline.timelineActionsPopover!.beat)
          }
          onInsertAllTracks={() =>
            props.timelineActions.onPasteAtTimeline("insert-all-tracks", props.timeline.timelineActionsPopover!.beat)
          }
          onAddStart={() =>
            props.timelineActions.onAddLoopBoundary(props.timeline.timelineActionsPopover!.beat, "start")
          }
          onAddEnd={() => props.timelineActions.onAddLoopBoundary(props.timeline.timelineActionsPopover!.beat, "end")}
          onExpandLoopToNotes={props.timelineActions.onExpandLoopToNotes}
          onUpdateRepeatCount={props.timelineActions.onUpdateLoopRepeatCount}
          onRemoveStart={props.timelineActions.onRemoveStartLoopBoundary}
          onRemoveEnd={props.timelineActions.onRemoveEndLoopBoundary}
          onClose={props.timelineActions.onCloseTimelineActionsPopover}
        />
      )}

      <QuickHelpDialog
        keyboardShortcutSections={keyboardShortcutSections}
        keyboardLayout="two-column"
        mouseHelpItems={mouseHelpItems}
        onClose={closeHelp}
        open={helpOpen}
      />
    </>
  );
}
