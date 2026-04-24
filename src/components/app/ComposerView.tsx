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

interface ComposerViewProps {
  project: Project;
  recentProjects: RecentProjectSnapshot[];
  selectedTrackId: string;
  defaultPitch: string;
  invalidPatchIds: Set<string>;
  canvasSelection: TrackCanvasSelection;
  playheadBeat: number;
  activeRecordedNotes: Array<{ trackId: string; noteId: string; startBeat: number }>;
  keyboardPlacementNote?: { trackId: string; noteId: string } | null;
  ghostPreviewNote?: { trackId: string; startBeat: number; durationBeats: number; pitchStr: string } | null;
  tabSelectionPreviewNote?: { trackId: string; noteId: string } | null;
  playheadFocused?: boolean;
  selectedContentTabStopFocusToken?: number;
  ghostPlayheadBeat?: number;
  countInLabel?: string;
  timelineActionsPopover: TimelineActionsPopoverRequest | null;
  selectionActionPopoverVisible: boolean;
  noteClipboardPayload: unknown;
  startMarkerAtTimelineBeat?: { id: string } | null;
  endMarkerAtTimelineBeat?: { id: string; repeatCount?: number } | null;
  expandableLoopRegion: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  recordingDisabled: boolean;
  isPlaying: boolean;
  recordEnabled: boolean;
  recordPhase?: ComposerRecordPhase;
  exportingAudio: boolean;
  onOpenDefaultPitchPicker: () => void;
  onPlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onClearCurrentProject: () => void;
  onRenameProject: (name: string) => void;
  onNewProject: () => void;
  onOpenPatchWorkspace: () => void;
  onExportAudio: () => void;
  onTempoChange: (tempo: number) => void;
  onMeterChange: (meter: Project["global"]["meter"]) => void;
  onGridChange: (gridBeats: number) => void;
  onAddTrack: () => void;
  onRemoveTrack: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
  onSetPlayheadBeat: (beat: number) => void;
  onReturnSelectedNoteFocusToPlayhead: () => void;
  onRequestTimelineActionsPopover: (request: TimelineActionsPopoverRequest) => void;
  onCloseTimelineActionsPopover: () => void;
  onPasteAtTimeline: (mode: "paste" | "paste-all-tracks" | "insert" | "insert-all-tracks", beat: number) => void;
  onAddLoopBoundary: (beat: number, kind: "start" | "end") => void;
  onExpandLoopToNotes: () => void;
  onUpdateLoopRepeatCount: (repeatCount: number) => void;
  onRemoveStartLoopBoundary: () => void;
  onRemoveEndLoopBoundary: () => void;
  trackActions: ComponentProps<typeof TrackCanvas>["trackActions"];
  patchActions: ComponentProps<typeof TrackCanvas>["patchActions"];
  automationActions: ComponentProps<typeof TrackCanvas>["automationActions"];
  noteActions: ComponentProps<typeof TrackCanvas>["noteActions"];
  selectionActions: ComponentProps<typeof TrackCanvas>["selectionActions"];
}

export function ComposerView(props: ComposerViewProps) {
  const {
    allTracksModifierLabel,
    deleteKeyLabel,
    primaryModifierLabel
  } = usePlatformShortcuts();
  const {
    closeHelp,
    helpOpen,
    keyboardShortcutSections,
    mouseHelpItems,
    openHelp
  } = useComposerQuickHelpDialog({
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
        playheadBeat={props.playheadBeat}
        importInputRef={props.importInputRef}
        recentProjects={props.recentProjects}
        onRenameProject={props.onRenameProject}
        onNewProject={props.onNewProject}
        onOpenPatchWorkspace={props.onOpenPatchWorkspace}
        onExportAudio={props.onExportAudio}
        exportAudioDisabled={props.exportingAudio}
        onTempoChange={props.onTempoChange}
        onMeterChange={props.onMeterChange}
        onGridChange={props.onGridChange}
        onExportJson={props.onExportJson}
        onImportJson={props.onImportJson}
        onOpenRecentProject={props.onOpenRecentProject}
        onResetToDefaultProject={props.onResetToDefaultProject}
        onImportFile={props.onImportFile}
        onOpenHelp={openHelp}
      />

      <ComposerActionsBar
        recordingDisabled={props.recordingDisabled}
        isPlaying={props.isPlaying}
        recordEnabled={props.recordEnabled}
        recordPhase={props.recordPhase}
        countInLabel={props.countInLabel}
        defaultPitch={props.defaultPitch}
        canRemoveTrack={props.project.tracks.length > 1}
        onOpenDefaultPitchPicker={props.onOpenDefaultPitchPicker}
        onPlay={props.onPlay}
        onStop={props.onStop}
        onToggleRecord={props.onToggleRecord}
        onClearProject={props.onClearCurrentProject}
        onAddTrack={props.onAddTrack}
        onRemoveTrack={props.onRemoveTrack}
      />

      <TrackCanvas
        project={props.project}
        invalidPatchIds={props.invalidPatchIds}
        selectedTrackId={props.selectedTrackId}
        defaultPitch={props.defaultPitch}
        selection={props.canvasSelection}
        playheadBeat={props.playheadBeat}
        activeRecordedNotes={props.activeRecordedNotes}
        keyboardPlacementNote={props.keyboardPlacementNote}
        ghostPreviewNote={props.ghostPreviewNote}
        tabSelectionPreviewNote={props.tabSelectionPreviewNote}
        playheadFocused={props.playheadFocused}
        selectedContentTabStopFocusToken={props.selectedContentTabStopFocusToken}
        ghostPlayheadBeat={props.ghostPlayheadBeat}
        countInLabel={props.countInLabel}
        timelineActionsPopoverOpen={Boolean(props.timelineActionsPopover)}
        hideSelectionActionPopover={!props.selectionActionPopoverVisible}
        onSetPlayheadBeat={props.onSetPlayheadBeat}
        onReturnSelectedNoteFocusToPlayhead={props.onReturnSelectedNoteFocusToPlayhead}
        onRequestTimelineActionsPopover={props.onRequestTimelineActionsPopover}
        trackActions={props.trackActions}
        patchActions={props.patchActions}
        automationActions={props.automationActions}
        noteActions={props.noteActions}
        selectionActions={props.selectionActions}
      />

      {props.timelineActionsPopover && (
        <TimelineActionsPopover
          left={props.timelineActionsPopover.clientX}
          top={props.timelineActionsPopover.clientY + 12}
          showPasteActions={Boolean(props.noteClipboardPayload)}
          showAddStart={!props.startMarkerAtTimelineBeat}
          showAddEnd={props.timelineActionsPopover.beat > 0 && !props.endMarkerAtTimelineBeat}
          showExpandLoopToNotes={props.expandableLoopRegion}
          startMarkerId={props.startMarkerAtTimelineBeat?.id}
          endMarkerId={props.endMarkerAtTimelineBeat?.id}
          endRepeatCount={props.endMarkerAtTimelineBeat?.repeatCount}
          onPaste={() => props.onPasteAtTimeline("paste", props.timelineActionsPopover!.beat)}
          onPasteAllTracks={() => props.onPasteAtTimeline("paste-all-tracks", props.timelineActionsPopover!.beat)}
          onInsert={() => props.onPasteAtTimeline("insert", props.timelineActionsPopover!.beat)}
          onInsertAllTracks={() => props.onPasteAtTimeline("insert-all-tracks", props.timelineActionsPopover!.beat)}
          onAddStart={() => props.onAddLoopBoundary(props.timelineActionsPopover!.beat, "start")}
          onAddEnd={() => props.onAddLoopBoundary(props.timelineActionsPopover!.beat, "end")}
          onExpandLoopToNotes={props.onExpandLoopToNotes}
          onUpdateRepeatCount={props.onUpdateLoopRepeatCount}
          onRemoveStart={props.onRemoveStartLoopBoundary}
          onRemoveEnd={props.onRemoveEndLoopBoundary}
          onClose={props.onCloseTimelineActionsPopover}
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
