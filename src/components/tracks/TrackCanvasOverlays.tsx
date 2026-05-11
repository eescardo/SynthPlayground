"use client";

import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction
} from "react";
import { SelectionActionPopover } from "@/components/SelectionActionPopover";
import { TrackCanvasTabStops } from "@/components/tracks/TrackCanvasTabStops";
import { TrackHeaderChrome } from "@/components/tracks/TrackCanvasChrome";
import { resolveTrackCanvasCursor } from "@/components/tracks/trackCanvasConstants";
import {
  TrackCanvasAutomationActions,
  TrackCanvasPatchActions,
  TrackCanvasSelection,
  TrackCanvasSelectionActions,
  TrackCanvasTrackActions,
  TrackLayout
} from "@/components/tracks/trackCanvasTypes";
import { TrackCanvasSelectedContentTabStopRect } from "@/components/tracks/trackCanvasSelection";
import { formatBeatName } from "@/lib/musicTiming";
import { Project } from "@/types/music";
import styles from "./TrackCanvas.module.css";

interface TrackCanvasOverlaysProps {
  project: Project;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  playheadTabStopRef: RefObject<HTMLButtonElement | null>;
  selectedContentTabStopRef: RefObject<HTMLButtonElement | null>;
  trackLayouts: TrackLayout[];
  width: number;
  height: number;
  canvasCursor: Parameters<typeof resolveTrackCanvasCursor>[0];
  selectedTrackId?: string;
  invalidPatchIds?: Set<string>;
  editingTrackId: string | null;
  editingTrackName: string;
  setEditingTrackId: Dispatch<SetStateAction<string | null>>;
  setEditingTrackName: Dispatch<SetStateAction<string>>;
  volumePopoverTrackId: string | null;
  volumePopoverPosition: { left: number; top: number } | null;
  openVolumePopover: (trackId: string, anchor?: HTMLElement | null) => void;
  scheduleVolumePopoverOpen: (trackId: string, anchor?: HTMLElement | null) => void;
  scheduleVolumePopoverDismiss: () => void;
  cancelScheduledVolumePopoverDismiss: () => void;
  trackActions: TrackCanvasTrackActions;
  patchActions: TrackCanvasPatchActions;
  automationActions: TrackCanvasAutomationActions;
  playheadBeat: number;
  meterBeats: number;
  playheadTabStopLeft: number;
  selectedContentTabStopRect: TrackCanvasSelectedContentTabStopRect | null;
  onPlayheadFocus: () => void;
  onPlayheadBlur: () => void;
  onSelectedContentFocus: () => void;
  onSelectedContentBlur: () => void;
  onReturnSelectedNoteFocusToPlayhead?: () => void;
  selection: TrackCanvasSelection;
  selectionBeatRange: Exclude<TrackCanvasSelection, { kind: "none" }>["beatRange"] | null;
  selectionLabel: string | null;
  selectionRect: unknown;
  hideSelectionActionPopover?: boolean;
  selectionActions: TrackCanvasSelectionActions;
  getSelectionPopoverAnchorPosition: () => { left: number; top: number } | null;
  onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onDoubleClick: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
}

export function TrackCanvasOverlays(props: TrackCanvasOverlaysProps) {
  return (
    <div className={`track-canvas-shell ${styles.shell}`} ref={props.wrapperRef}>
      <TrackHeaderChrome
        project={props.project}
        canvasShellRef={props.wrapperRef}
        trackLayouts={props.trackLayouts}
        selectedTrackId={props.selectedTrackId}
        invalidPatchIds={props.invalidPatchIds}
        editingTrackId={props.editingTrackId}
        editingTrackName={props.editingTrackName}
        setEditingTrackId={props.setEditingTrackId}
        setEditingTrackName={props.setEditingTrackName}
        volumePopoverTrackId={props.volumePopoverTrackId}
        volumePopoverPosition={props.volumePopoverPosition}
        openVolumePopover={props.openVolumePopover}
        scheduleVolumePopoverOpen={props.scheduleVolumePopoverOpen}
        scheduleVolumePopoverDismiss={props.scheduleVolumePopoverDismiss}
        cancelScheduledVolumePopoverDismiss={props.cancelScheduledVolumePopoverDismiss}
        trackActions={props.trackActions}
        patchActions={props.patchActions}
        automationActions={props.automationActions}
      />
      <canvas
        className={styles.canvas}
        ref={props.canvasRef}
        width={props.width}
        height={props.height}
        style={{
          cursor: resolveTrackCanvasCursor(props.canvasCursor)
        }}
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerLeave={props.onPointerLeave}
        onDoubleClick={props.onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      />
      <TrackCanvasTabStops
        playheadLabel={`Playhead at beat ${formatBeatName(props.playheadBeat, props.meterBeats)}`}
        playheadLeft={props.playheadTabStopLeft}
        height={props.height}
        playheadTabStopRef={props.playheadTabStopRef}
        selectedContentTabStopRef={props.selectedContentTabStopRef}
        selectedContentRect={props.selectedContentTabStopRect}
        onPlayheadFocus={props.onPlayheadFocus}
        onPlayheadBlur={props.onPlayheadBlur}
        onSelectedContentFocus={props.onSelectedContentFocus}
        onSelectedContentBlur={props.onSelectedContentBlur}
        onReturnSelectedContentFocusToPlayhead={props.onReturnSelectedNoteFocusToPlayhead}
      />
      {props.selectionBeatRange && !props.selectionRect && !props.hideSelectionActionPopover && (
        <SelectionActionPopover
          selectionLabel={props.selectionLabel ?? (props.selection.kind === "timeline" ? "All Tracks" : "Track 1")}
          getAnchorPosition={props.getSelectionPopoverAnchorPosition}
          collapsed={props.selectionActions.selectionActionPopoverCollapsed}
          onPreviewScopeChange={props.selectionActions.onPreviewSelectionActionScopeChange}
          onExpand={props.selectionActions.onExpandSelectionActionPopover}
          onDismiss={props.selectionActions.onDismissSelectionActionPopover}
          onCut={props.selectionActions.onCutSelection}
          onCopy={props.selectionActions.onCopySelection}
          onDelete={props.selectionActions.onDeleteSelection}
          onExplode={props.selectionActions.onOpenExplodeSelectionDialog}
          onCutAllTracks={props.selectionActions.onCutAllTracksInSelection}
          onCopyAllTracks={props.selectionActions.onCopyAllTracksInSelection}
          onDeleteAllTracks={props.selectionActions.onDeleteAllTracksInSelection}
        />
      )}
    </div>
  );
}
