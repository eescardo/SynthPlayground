"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { TrackCanvasOverlays } from "@/components/tracks/TrackCanvasOverlays";
import { AutomationKeyframeRect } from "@/components/tracks/trackCanvasAutomationLane";
import {
  BEAT_ZOOM_STEP,
  BEAT_WIDTH,
  HEADER_WIDTH,
  MAX_BEAT_WIDTH,
  MIN_BEAT_WIDTH,
  NOTE_RESIZE_HANDLE_WIDTH,
  RULER_HEIGHT
} from "@/components/tracks/trackCanvasConstants";
import { LoopMarkerRect, MuteRect, PitchRect } from "@/components/tracks/trackCanvasGeometry";
import { renderTrackCanvas } from "@/components/tracks/trackCanvasDrawing";
import { consumeTimelinePopoverWheelEvent } from "@/components/tracks/trackCanvasWheelGuards";
import { NoteRect, useTrackCanvasPointerInteractions } from "@/hooks/tracks/useTrackCanvasPointerInteractions";
import { TrackCanvasProps, TrackLayout } from "@/components/tracks/trackCanvasTypes";
import { useTrackCanvasRenderModel } from "@/components/tracks/trackCanvasRenderModel";
import { useTrackCanvasPlayheadAutoScroll } from "@/hooks/tracks/useTrackCanvasPlayheadAutoScroll";
import { useTrackCanvasWheelPitchEditing } from "@/hooks/tracks/useTrackCanvasWheelPitchEditing";
import { useVolumePopover } from "@/hooks/useVolumePopover";
import { clamp01 } from "@/lib/numeric";
import { isTrackVolumeMuted } from "@/lib/trackVolume";
import { Track } from "@/types/music";
export type {
  TimelineActionsPopoverRequest,
  TrackCanvasProps,
  TrackCanvasSelection
} from "@/components/tracks/trackCanvasTypes";

export function TrackCanvas(props: TrackCanvasProps) {
  const { automationActions, noteActions, patchActions, project, selection, selectionActions, trackActions } = props;
  const { onUpdateNote } = noteActions;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const beatWidthRef = useRef(BEAT_WIDTH);
  const totalBeatsRef = useRef(0);
  const zoomGestureRef = useRef<{ beat: number; clientX: number } | null>(null);
  const zoomGestureTimerRef = useRef<number | null>(null);
  const zoomScrollCorrectionTokenRef = useRef(0);
  const playheadTabStopRef = useRef<HTMLButtonElement | null>(null);
  const selectedContentTabStopRef = useRef<HTMLButtonElement | null>(null);
  const noteRectsRef = useRef<NoteRect[]>([]);
  const automationKeyframeRectsRef = useRef<AutomationKeyframeRect[]>([]);
  const muteRectsRef = useRef<MuteRect[]>([]);
  const pitchRectsRef = useRef<PitchRect[]>([]);
  const loopMarkerRectsRef = useRef<LoopMarkerRect[]>([]);
  const [playheadTabStopFocused, setPlayheadTabStopFocused] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState("");
  const [selectedContentTabStopFocused, setSelectedContentTabStopFocused] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [beatWidth, setBeatWidth] = useState(BEAT_WIDTH);
  beatWidthRef.current = beatWidth;
  const {
    volumePopoverTrackId,
    volumePopoverPosition,
    openVolumePopover,
    closeVolumePopover,
    scheduleVolumePopoverOpen,
    scheduleVolumePopoverDismiss,
    cancelScheduledVolumePopoverDismiss
  } = useVolumePopover();

  const {
    activeRecordedNotes,
    countInLabel,
    defaultPitch,
    ghostPlayheadBeat,
    ghostPreviewNote,
    hideSelectionActionPopover,
    invalidPatchIds,
    keyboardPlacementNote,
    tabSelectionPreviewNote,
    playheadFocused,
    playheadBeat,
    selectedContentTabStopFocusToken,
    selectedTrackId,
    selectionMarqueeActive,
    timelineActionsPopoverOpen
  } = props;
  const { onRequestTimelineActionsPopover, onReturnSelectedNoteFocusToPlayhead, onSetPlayheadBeat } = props;
  const {
    automationKeyframeSelectionKeys,
    gridBeats,
    height,
    meterBeats,
    playheadTabStopLeft,
    selectedContentTabStopRect,
    selectedNoteKeys,
    selectionBeatRange,
    selectionLabel,
    selectionMarkerTrackId,
    totalBeats,
    trackLayouts,
    width
  } = useTrackCanvasRenderModel({
    beatWidth,
    playheadBeat,
    project,
    selection,
    viewportWidth
  });
  totalBeatsRef.current = totalBeats;

  const beatFromX = useCallback((x: number) => (x - HEADER_WIDTH) / beatWidth, [beatWidth]);
  const fixedLaneSliderStartX = HEADER_WIDTH + Math.min(beatWidth * 0.25, 18);
  const fixedLaneSliderEndX = Math.min(width - 10, fixedLaneSliderStartX + beatWidth * 3.8);
  const fixedLaneValueFromX = (x: number) =>
    clamp01((x - fixedLaneSliderStartX) / Math.max(1, fixedLaneSliderEndX - fixedLaneSliderStartX));
  const isTrackSilenced = useCallback((track: Track) => track.mute || isTrackVolumeMuted(track.volume), []);
  const getSelectionPopoverAnchorPosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !selectionBeatRange) {
      return null;
    }
    const rect = wrapper.getBoundingClientRect();
    return {
      left: rect.left + HEADER_WIDTH + selectionBeatRange.endBeat * beatWidth + 14 - wrapper.scrollLeft,
      top: rect.top + 10
    };
  }, [beatWidth, selectionBeatRange]);

  const correctZoomScroll = useCallback((anchorBeat: number, clientX: number) => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const anchorOffsetX = clientX - wrapperRect.left;
    const measuredBeatWidth =
      totalBeatsRef.current > 0
        ? Math.max(1, (canvas.width - HEADER_WIDTH) / totalBeatsRef.current)
        : beatWidthRef.current;
    const measuredBeat = (wrapper.scrollLeft + anchorOffsetX - HEADER_WIDTH) / measuredBeatWidth;
    const correctionPx = (anchorBeat - measuredBeat) * measuredBeatWidth;
    if (Math.abs(correctionPx) < 0.5) {
      return;
    }
    const maxScrollLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    wrapper.scrollLeft = Math.min(maxScrollLeft, Math.max(0, wrapper.scrollLeft + correctionPx));
  }, []);

  const onWheelZoom = useCallback(
    (event: WheelEvent) => {
      if (consumeTimelinePopoverWheelEvent(event)) {
        return;
      }
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const clientX = event.clientX;
      const currentBeatWidth = beatWidthRef.current;
      const wrapperRect = wrapper.getBoundingClientRect();
      const anchorOffsetX = clientX - wrapperRect.left;
      const existingGesture = zoomGestureRef.current;
      const pointerMoved = existingGesture ? Math.abs(clientX - existingGesture.clientX) > 6 : false;
      const anchorBeat =
        existingGesture && !pointerMoved
          ? existingGesture.beat
          : Math.max(0, (wrapper.scrollLeft + anchorOffsetX - HEADER_WIDTH) / currentBeatWidth);
      zoomGestureRef.current = { beat: anchorBeat, clientX };
      if (zoomGestureTimerRef.current !== null) {
        window.clearTimeout(zoomGestureTimerRef.current);
      }
      zoomGestureTimerRef.current = window.setTimeout(() => {
        zoomGestureRef.current = null;
        zoomGestureTimerRef.current = null;
      }, 180);

      const zoomFactor = event.deltaY < 0 ? BEAT_ZOOM_STEP : 1 / BEAT_ZOOM_STEP;
      const proposedBeatWidth = Math.min(MAX_BEAT_WIDTH, Math.max(MIN_BEAT_WIDTH, currentBeatWidth * zoomFactor));
      let nextBeatWidth = proposedBeatWidth;
      const proposedScrollLeft = HEADER_WIDTH + anchorBeat * proposedBeatWidth - anchorOffsetX;
      if (proposedBeatWidth < currentBeatWidth && proposedScrollLeft < 0) {
        const resistance = 1 / (1 + Math.abs(proposedScrollLeft) / 180);
        const currentScrollLeft = HEADER_WIDTH + anchorBeat * currentBeatWidth - anchorOffsetX;
        if (currentScrollLeft < 0 || anchorBeat <= 0) {
          nextBeatWidth = currentBeatWidth - (currentBeatWidth - proposedBeatWidth) * resistance;
        } else {
          const boundaryBeatWidth = (anchorOffsetX - HEADER_WIDTH) / anchorBeat;
          nextBeatWidth = boundaryBeatWidth - (boundaryBeatWidth - proposedBeatWidth) * resistance;
        }
        nextBeatWidth = Math.min(currentBeatWidth, Math.max(MIN_BEAT_WIDTH, nextBeatWidth));
      }
      if (Math.abs(nextBeatWidth - currentBeatWidth) < 0.1) {
        return;
      }

      const nextScrollLeft = Math.max(0, HEADER_WIDTH + anchorBeat * nextBeatWidth - anchorOffsetX);
      flushSync(() => {
        setBeatWidth(nextBeatWidth);
      });
      beatWidthRef.current = nextBeatWidth;
      wrapper.scrollLeft = nextScrollLeft;
      correctZoomScroll(anchorBeat, clientX);
      zoomScrollCorrectionTokenRef.current += 1;
      const correctionToken = zoomScrollCorrectionTokenRef.current;
      window.requestAnimationFrame(() => {
        if (correctionToken === zoomScrollCorrectionTokenRef.current) {
          correctZoomScroll(anchorBeat, clientX);
        }
      });
    },
    [correctZoomScroll]
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    wrapper.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });
    return () => {
      wrapper.removeEventListener("wheel", onWheelZoom, true);
      if (zoomGestureTimerRef.current !== null) {
        window.clearTimeout(zoomGestureTimerRef.current);
        zoomGestureTimerRef.current = null;
      }
    };
  }, [onWheelZoom]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    const updateViewportWidth = () => setViewportWidth(wrapper.clientWidth);
    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, []);

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }, []);

  useTrackCanvasWheelPitchEditing({
    wrapperRef,
    pitchRectsRef,
    tracks: project.tracks,
    getCanvasPoint,
    onUpdateNote
  });

  const getTrackLayoutAtY = useCallback(
    (y: number): TrackLayout | null => {
      if (y < RULER_HEIGHT) {
        return null;
      }
      return trackLayouts.find((layout) => y >= layout.y && y <= layout.y + layout.height) ?? null;
    },
    [trackLayouts]
  );

  const {
    hoveredPitch,
    hoveredNote,
    hoveredAutomationKeyframe,
    hoveredLoopMarker,
    selectedLoopMarker,
    hoveredPlayhead,
    canvasCursor,
    selectionRect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onDoubleClick
  } = useTrackCanvasPointerInteractions({
    canvas: {
      canvasRef,
      noteRectsRef,
      automationKeyframeRectsRef,
      muteRectsRef,
      pitchRectsRef,
      loopMarkerRectsRef
    },
    model: {
      project,
      trackLayouts,
      playheadBeat,
      gridBeats,
      defaultPitch,
      selection,
      contentSelection:
        selection.kind === "note"
          ? {
              noteKeys: selection.content.noteKeys,
              automationKeyframeSelectionKeys: selection.content.automationKeyframeSelectionKeys
            }
          : undefined
    },
    actions: {
      noteActions,
      automationActions,
      selectionActions,
      trackActions,
      onSetPlayheadBeat,
      onRequestTimelineActionsPopover
    },
    geometry: {
      getCanvasPoint,
      getTrackLayoutAtY,
      beatFromX,
      beatWidth,
      fixedLaneValueFromX,
      headerWidth: HEADER_WIDTH,
      noteResizeHandleWidth: NOTE_RESIZE_HANDLE_WIDTH
    }
  });

  const draw = useCallback(() => {
    renderTrackCanvas({
      activeRecordedNotes,
      automationKeyframeRectsRef,
      canvasRef,
      countInLabel,
      ghostPlayheadBeat,
      ghostPreviewNote,
      hideSelectionActionPopover,
      hoveredAutomationKeyframe,
      hoveredLoopMarker,
      selectedLoopMarker,
      hoveredNote,
      hoveredPitch,
      hoveredPlayhead,
      invalidPatchIds,
      isTrackSilenced,
      keyboardPlacementNote,
      loopMarkerRectsRef,
      muteRectsRef,
      noteRectsRef,
      pitchRectsRef,
      playheadBeat,
      playheadTabStopFocused,
      project,
      renderModel: {
        automationKeyframeSelectionKeys,
        beatWidth,
        gridBeats,
        height,
        meterBeats,
        selectedNoteKeys,
        selectionBeatRange,
        selectionMarkerTrackId,
        totalBeats,
        trackLayouts,
        width
      },
      selectedContentTabStopFocused,
      selectedTrackId,
      selection,
      selectionMarqueeActive,
      selectionRect,
      tabSelectionPreviewNote,
      timelineActionsPopoverOpen
    });
  }, [
    countInLabel,
    beatWidth,
    ghostPlayheadBeat,
    ghostPreviewNote,
    hideSelectionActionPopover,
    tabSelectionPreviewNote,
    timelineActionsPopoverOpen,
    height,
    hoveredPlayhead,
    playheadTabStopFocused,
    hoveredPitch,
    hoveredNote,
    hoveredAutomationKeyframe,
    hoveredLoopMarker,
    selectedLoopMarker,
    isTrackSilenced,
    meterBeats,
    activeRecordedNotes,
    keyboardPlacementNote,
    invalidPatchIds,
    playheadBeat,
    gridBeats,
    project,
    selectedNoteKeys,
    selectedContentTabStopFocused,
    automationKeyframeSelectionKeys,
    selectionBeatRange,
    selectionMarkerTrackId,
    selectedTrackId,
    selection,
    selectionMarqueeActive,
    selectionRect,
    totalBeats,
    trackLayouts,
    width
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  useTrackCanvasPlayheadAutoScroll({
    beatWidth,
    wrapperRef,
    playheadBeat,
    playheadFocused: Boolean(playheadFocused),
    isPlaying: Boolean(props.isPlaying)
  });

  useEffect(() => {
    if (!editingTrackId) {
      return;
    }
    const trackStillExists = project.tracks.some((track) => track.id === editingTrackId);
    if (!trackStillExists) {
      setEditingTrackId(null);
      setEditingTrackName("");
    }
  }, [editingTrackId, project.tracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeVolumePopover();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-track-chrome="volume-button"], [data-track-popover="volume"]')) {
        return;
      }
      closeVolumePopover();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeVolumePopover]);

  useEffect(() => {
    if (!playheadFocused) {
      return;
    }
    if (document.activeElement === selectedContentTabStopRef.current) {
      return;
    }
    playheadTabStopRef.current?.focus();
  }, [playheadBeat, playheadFocused]);

  useEffect(() => {
    if (!selectedContentTabStopFocusToken || !selectedContentTabStopRect) {
      return;
    }
    selectedContentTabStopRef.current?.focus();
  }, [selectedContentTabStopFocusToken, selectedContentTabStopRect]);

  useEffect(() => {
    if (selectedContentTabStopRect) {
      return;
    }
    setSelectedContentTabStopFocused(false);
  }, [selectedContentTabStopRect]);

  return (
    <TrackCanvasOverlays
      project={project}
      canvasRef={canvasRef}
      wrapperRef={wrapperRef}
      playheadTabStopRef={playheadTabStopRef}
      selectedContentTabStopRef={selectedContentTabStopRef}
      trackLayouts={trackLayouts}
      width={width}
      height={height}
      canvasCursor={canvasCursor}
      selectedTrackId={selectedTrackId}
      invalidPatchIds={invalidPatchIds}
      editingTrackId={editingTrackId}
      editingTrackName={editingTrackName}
      setEditingTrackId={setEditingTrackId}
      setEditingTrackName={setEditingTrackName}
      volumePopoverTrackId={volumePopoverTrackId}
      volumePopoverPosition={volumePopoverPosition}
      openVolumePopover={openVolumePopover}
      scheduleVolumePopoverOpen={scheduleVolumePopoverOpen}
      scheduleVolumePopoverDismiss={scheduleVolumePopoverDismiss}
      cancelScheduledVolumePopoverDismiss={cancelScheduledVolumePopoverDismiss}
      trackActions={trackActions}
      patchActions={patchActions}
      automationActions={automationActions}
      playheadBeat={playheadBeat}
      meterBeats={meterBeats}
      playheadTabStopLeft={playheadTabStopLeft}
      selectedContentTabStopRect={selectedContentTabStopRect}
      onPlayheadFocus={() => setPlayheadTabStopFocused(true)}
      onPlayheadBlur={() => setPlayheadTabStopFocused(false)}
      onSelectedContentFocus={() => setSelectedContentTabStopFocused(true)}
      onSelectedContentBlur={() => setSelectedContentTabStopFocused(false)}
      onReturnSelectedNoteFocusToPlayhead={onReturnSelectedNoteFocusToPlayhead}
      selection={selection}
      selectionBeatRange={selectionBeatRange}
      selectionLabel={selectionLabel}
      selectionRect={selectionRect}
      hideSelectionActionPopover={hideSelectionActionPopover}
      selectionActions={selectionActions}
      getSelectionPopoverAnchorPosition={getSelectionPopoverAnchorPosition}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
    />
  );
}
