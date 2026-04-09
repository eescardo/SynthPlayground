"use client";

import type { ComponentProps, RefObject } from "react";
import { ProjectActionsBar } from "@/components/home/ProjectActionsBar";
import { TimelineActionsPopover } from "@/components/TimelineActionsPopover";
import { TimelineActionsPopoverRequest, TrackCanvas, TrackCanvasSelection } from "@/components/tracks/TrackCanvas";
import { TransportBar } from "@/components/TransportBar";
import { Project } from "@/types/music";

interface ComposerViewProps {
  project: Project;
  selectedTrackId: string;
  invalidPatchIds: Set<string>;
  canvasSelection: TrackCanvasSelection;
  playheadBeat: number;
  activeRecordedNotes: Array<{ trackId: string; noteId: string; startBeat: number }>;
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
  recordPhase: ComponentProps<typeof TransportBar>["recordPhase"];
  exportingAudio: boolean;
  onPlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onExportAudio: () => void;
  onTempoChange: (tempo: number) => void;
  onMeterChange: (meter: Project["global"]["meter"]) => void;
  onGridChange: (gridBeats: number) => void;
  onAddTrack: () => void;
  onRemoveTrack: () => void;
  onOpenHelp: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onClearProject: () => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
  onSetPlayheadBeat: (beat: number) => void;
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
  return (
    <>
      <TransportBar
        tempo={props.project.global.tempo}
        meter={props.project.global.meter}
        gridBeats={props.project.global.gridBeats}
        isPlaying={props.isPlaying}
        recordEnabled={props.recordEnabled}
        recordPhase={props.recordPhase}
        countInLabel={props.countInLabel}
        playheadBeat={props.playheadBeat}
        onPlay={props.onPlay}
        onStop={props.onStop}
        onToggleRecord={props.onToggleRecord}
        onExportAudio={props.onExportAudio}
        exportAudioDisabled={props.exportingAudio}
        onTempoChange={props.onTempoChange}
        onMeterChange={props.onMeterChange}
        onGridChange={props.onGridChange}
      />

      <ProjectActionsBar
        recordingDisabled={props.recordingDisabled}
        canRemoveTrack={props.project.tracks.length > 1}
        onAddTrack={props.onAddTrack}
        onRemoveTrack={props.onRemoveTrack}
        onOpenHelp={props.onOpenHelp}
        onExportJson={props.onExportJson}
        onImportJson={props.onImportJson}
        onClearProject={props.onClearProject}
        onResetToDefaultProject={props.onResetToDefaultProject}
        importInputRef={props.importInputRef}
        onImportFile={props.onImportFile}
      />

      <TrackCanvas
        project={props.project}
        invalidPatchIds={props.invalidPatchIds}
        selectedTrackId={props.selectedTrackId}
        selection={props.canvasSelection}
        playheadBeat={props.playheadBeat}
        activeRecordedNotes={props.activeRecordedNotes}
        ghostPlayheadBeat={props.ghostPlayheadBeat}
        countInLabel={props.countInLabel}
        timelineActionsPopoverOpen={Boolean(props.timelineActionsPopover)}
        hideSelectionActionPopover={!props.selectionActionPopoverVisible}
        onSetPlayheadBeat={props.onSetPlayheadBeat}
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
    </>
  );
}
