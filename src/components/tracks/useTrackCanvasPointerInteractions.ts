"use client";

import { MutableRefObject, RefObject, useCallback, useRef, useState } from "react";
import {
  AutomationKeyframeRect,
  automationValueFromY,
  findAutomationKeyframeRect
} from "@/components/tracks/trackCanvasAutomationLane";
import {
  AutomationLaneLayout,
  TrackCanvasAutomationActions,
  TrackCanvasNoteActions,
  TrackCanvasSelection,
  TrackCanvasSelectionActions,
  TrackCanvasTrackActions,
  TrackLayout,
  TimelineActionsPopoverRequest
} from "@/components/tracks/trackCanvasTypes";
import {
  CanvasCursor,
  findLoopMarkerRect,
  findMuteRect,
  findPitchRect,
  getCursorForPosition,
  getHoverTarget,
  isOverPlayhead,
  LoopMarkerRect,
  MuteRect,
  PitchRect,
  PLAYHEAD_HIT_HALF_WIDTH
} from "@/components/tracks/trackCanvasGeometry";
import { PRIMARY_POINTER_BUTTON, SECONDARY_POINTER_BUTTON } from "@/lib/inputConstants";
import { createDefaultPlacedNote } from "@/lib/noteDefaults";
import { getNoteSelectionKey } from "@/lib/noteClipboard";
import { snapToGrid } from "@/lib/musicTiming";
import { Project, Track } from "@/types/music";

interface DragState {
  trackId: string;
  noteId: string;
  mode: "move" | "resize";
  offsetBeats: number;
  noteStartBeats: number;
}

export interface NoteRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

type PendingCanvasAction =
  | {
      kind: "track";
      trackId: string;
      startX: number;
      startY: number;
      beat: number;
      pointerId: number;
    }
  | {
      kind: "ruler";
      startBeat: number;
      pointerId: number;
    };

type PendingLaneAction =
  | {
      kind: "automation-keyframe";
      trackId: string;
      macroId: string;
      beat: number;
      value: number;
      pointerId: number;
    }
  | {
      kind: "fixed-slider";
      trackId: string;
      macroId: string;
      pointerId: number;
    };

interface AutomationDragState {
  trackId: string;
  macroId: string;
  keyframeId: string;
  beat: number;
  side: "single" | "incoming" | "outgoing";
  boundary: "start" | "end" | null;
}

export interface HoveredLoopMarker {
  markerId: string;
  kind: "start" | "end";
  beat: number;
}

interface UseTrackCanvasPointerInteractionsParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  project: Project;
  trackLayouts: TrackLayout[];
  playheadBeat: number;
  gridBeats: number;
  selection: TrackCanvasSelection;
  selectedNoteKeys: ReadonlySet<string> | undefined;
  noteActions: TrackCanvasNoteActions;
  automationActions: TrackCanvasAutomationActions;
  selectionActions: TrackCanvasSelectionActions;
  trackActions: TrackCanvasTrackActions;
  noteRectsRef: MutableRefObject<NoteRect[]>;
  automationKeyframeRectsRef: MutableRefObject<AutomationKeyframeRect[]>;
  muteRectsRef: MutableRefObject<MuteRect[]>;
  pitchRectsRef: MutableRefObject<PitchRect[]>;
  loopMarkerRectsRef: MutableRefObject<LoopMarkerRect[]>;
  getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
  getTrackLayoutAtY: (y: number) => TrackLayout | null;
  beatFromX: (x: number) => number;
  fixedLaneValueFromX: (x: number) => number;
  headerWidth: number;
  noteResizeHandleWidth: number;
  onSetPlayheadBeat: (beat: number) => void;
  onRequestTimelineActionsPopover: (request: TimelineActionsPopoverRequest) => void;
}

export function useTrackCanvasPointerInteractions({
  canvasRef,
  project,
  trackLayouts,
  playheadBeat,
  gridBeats,
  selection,
  selectedNoteKeys,
  noteActions,
  automationActions,
  selectionActions,
  trackActions,
  noteRectsRef,
  automationKeyframeRectsRef,
  muteRectsRef,
  pitchRectsRef,
  loopMarkerRectsRef,
  getCanvasPoint,
  getTrackLayoutAtY,
  beatFromX,
  fixedLaneValueFromX,
  headerWidth,
  noteResizeHandleWidth,
  onSetPlayheadBeat,
  onRequestTimelineActionsPopover
}: UseTrackCanvasPointerInteractionsParams) {
  const dragRef = useRef<DragState | null>(null);
  const pendingCanvasActionRef = useRef<PendingCanvasAction | null>(null);
  const automationDragRef = useRef<AutomationDragState | null>(null);
  const pendingLaneActionRef = useRef<PendingLaneAction | null>(null);

  const [hoveredPitch, setHoveredPitch] = useState<{ trackId: string; noteId: string } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<{ trackId: string; noteId: string } | null>(null);
  const [hoveredAutomationKeyframe, setHoveredAutomationKeyframe] = useState<{
    trackId: string;
    macroId: string;
    keyframeId: string;
    side: "single" | "incoming" | "outgoing";
  } | null>(null);
  const [hoveredLoopMarker, setHoveredLoopMarker] = useState<HoveredLoopMarker | null>(null);
  const [hoveredPlayhead, setHoveredPlayhead] = useState(false);
  const [canvasCursor, setCanvasCursor] = useState<CanvasCursor>("default");
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);

  const findNoteRect = useCallback((x: number, y: number): NoteRect | null => {
    for (const rect of noteRectsRef.current) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return rect;
      }
    }
    return null;
  }, [noteRectsRef]);

  const getTrackAtY = useCallback((y: number): Track | null => {
    const layout = getTrackLayoutAtY(y);
    if (!layout) {
      return null;
    }
    return project.tracks.find((track) => track.id === layout.trackId) ?? null;
  }, [getTrackLayoutAtY, project.tracks]);

  const getAutomationLaneAtPoint = useCallback((x: number, y: number): { track: Track; lane: AutomationLaneLayout } | null => {
    if (x < headerWidth) {
      return null;
    }
    const layout = getTrackLayoutAtY(y);
    if (!layout) {
      return null;
    }
    const lane = layout.automationLanes.find((entry) => entry.automated && y >= entry.y && y <= entry.y + entry.height);
    if (!lane) {
      return null;
    }
    const track = project.tracks.find((entry) => entry.id === layout.trackId);
    return track ? { track, lane } : null;
  }, [getTrackLayoutAtY, headerWidth, project.tracks]);

  const resolvePointerTargets = useCallback((x: number, y: number) => {
    const automationLaneHit = getAutomationLaneAtPoint(x, y);
    const muteRect = findMuteRect(muteRectsRef.current, x, y);
    const pitchRect = findPitchRect(pitchRectsRef.current, x, y);
    const noteRect = findNoteRect(x, y);
    const loopMarkerRect = automationLaneHit ? null : findLoopMarkerRect(loopMarkerRectsRef.current, x, y);
    const playheadHit = automationLaneHit
      ? false
      : isOverPlayhead(x, playheadBeat, headerWidth, 72, PLAYHEAD_HIT_HALF_WIDTH);
    const hoverTarget = getHoverTarget({
      hasMuteHit: Boolean(muteRect),
      hasPitchHit: Boolean(pitchRect),
      hasLoopMarkerHit: Boolean(loopMarkerRect),
      hasPlayheadHit: playheadHit,
      noteRect
    });
    return {
      muteRect,
      pitchRect,
      noteRect,
      automationLaneHit,
      loopMarkerRect,
      playheadHit,
      hoverTarget
    };
  }, [findNoteRect, getAutomationLaneAtPoint, headerWidth, loopMarkerRectsRef, muteRectsRef, pitchRectsRef, playheadBeat]);

  const updateSelectionFromRect = useCallback((nextRect: SelectionRect | null) => {
    setSelectionRect(nextRect);
    selectionActions.onSetSelectionMarqueeActive(Boolean(nextRect));
    if (!nextRect) {
      return;
    }

    const left = Math.min(nextRect.startX, nextRect.endX);
    const right = Math.max(nextRect.startX, nextRect.endX);
    const top = Math.min(nextRect.startY, nextRect.endY);
    const bottom = Math.max(nextRect.startY, nextRect.endY);
    const selectedKeys = noteRectsRef.current
      .filter((rect) => rect.x < right && rect.x + rect.w > left && rect.y < bottom && rect.y + rect.h > top)
      .map((rect) => getNoteSelectionKey(rect.trackId, rect.noteId));
    selectionActions.onSetNoteSelection(selectedKeys);
  }, [noteRectsRef, selectionActions]);

  const updateTimelineSelectionFromRuler = useCallback((startBeat: number, endBeat: number) => {
    const orderedStartBeat = Math.min(startBeat, endBeat);
    const orderedEndBeat = Math.max(startBeat, endBeat);
    const beatSpan = orderedEndBeat - orderedStartBeat;
    selectionActions.onSetSelectionMarqueeActive(beatSpan > 0);
    selectionActions.onSetTimelineSelectionBeatRange(
      beatSpan > 0
        ? { startBeat: orderedStartBeat, endBeat: orderedEndBeat, beatSpan }
        : null
    );
  }, [selectionActions]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const targets = resolvePointerTargets(x, y);
    const automationKeyframe = findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y);
    const automationLaneHit = targets.automationLaneHit;
    const hasActiveSelection = Boolean(selectedNoteKeys?.size) || selection.kind === "timeline";

    if (y <= 28 && x >= headerWidth) {
      if (targets.hoverTarget === "loop-marker" && targets.loopMarkerRect) {
        onSetPlayheadBeat(targets.loopMarkerRect.beat);
        onRequestTimelineActionsPopover({
          beat: targets.loopMarkerRect.beat,
          clientX: event.clientX,
          clientY: event.clientY
        });
        setCanvasCursor("pointer");
        return;
      }

      if (targets.hoverTarget === "playhead") {
        onRequestTimelineActionsPopover({
          beat: playheadBeat,
          clientX: event.clientX,
          clientY: event.clientY
        });
        setCanvasCursor("pointer");
        return;
      }

      if (event.button === PRIMARY_POINTER_BUTTON) {
        selectionActions.onSetNoteSelection([]);
        selectionActions.onSetTimelineSelectionBeatRange(null);
        pendingCanvasActionRef.current = {
          kind: "ruler",
          startBeat: Math.max(0, snapToGrid(beatFromX(x), gridBeats)),
          pointerId: event.pointerId
        };
        selectionActions.onSetSelectionMarqueeActive(false);
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      onSetPlayheadBeat(Math.max(0, snapToGrid(beatFromX(x), gridBeats)));
      return;
    }

    const track = getTrackAtY(y);
    if (!track) return;

    trackActions.onSelectTrack(track.id);

    if (targets.hoverTarget === "mute" && targets.muteRect) {
      trackActions.onToggleTrackMute(targets.muteRect.trackId);
      setCanvasCursor("pointer");
      return;
    }

    if (x < headerWidth) {
      return;
    }

    if (targets.hoverTarget === "loop-marker" && targets.loopMarkerRect) {
      onSetPlayheadBeat(targets.loopMarkerRect.beat);
      onRequestTimelineActionsPopover({
        beat: targets.loopMarkerRect.beat,
        clientX: event.clientX,
        clientY: event.clientY
      });
      setCanvasCursor("pointer");
      return;
    }

    if (targets.hoverTarget === "playhead") {
      onRequestTimelineActionsPopover({
        beat: playheadBeat,
        clientX: event.clientX,
        clientY: event.clientY
      });
      setCanvasCursor("pointer");
      return;
    }

    if (targets.hoverTarget === "pitch" && targets.pitchRect && event.button === PRIMARY_POINTER_BUTTON) {
      selectionActions.onSetNoteSelection([getNoteSelectionKey(targets.pitchRect.trackId, targets.pitchRect.noteId)]);
      noteActions.onOpenPitchPicker(targets.pitchRect.trackId, targets.pitchRect.noteId);
      setCanvasCursor("pointer");
      return;
    }

    if (event.button === SECONDARY_POINTER_BUTTON) {
      if (automationKeyframe && automationKeyframe.boundary === null) {
        automationActions.onDeleteTrackMacroAutomationKeyframeSide(
          automationKeyframe.trackId,
          automationKeyframe.macroId,
          automationKeyframe.keyframeId,
          automationKeyframe.side
        );
        return;
      }
      if (targets.noteRect) {
        noteActions.onDeleteNote(targets.noteRect.trackId, targets.noteRect.noteId);
      }
      return;
    }

    if (automationKeyframe) {
      automationDragRef.current = {
        trackId: automationKeyframe.trackId,
        macroId: automationKeyframe.macroId,
        keyframeId: automationKeyframe.keyframeId,
        beat: automationKeyframe.beat,
        side: automationKeyframe.side,
        boundary: automationKeyframe.boundary
      };
      canvas.setPointerCapture(event.pointerId);
      setCanvasCursor("ns-resize");
      return;
    }

    if (automationLaneHit) {
      pendingLaneActionRef.current = {
        kind: "automation-keyframe",
        trackId: automationLaneHit.track.id,
        macroId: automationLaneHit.lane.laneId,
        beat: Math.max(0, snapToGrid(beatFromX(x), gridBeats)),
        value: automationValueFromY(y, automationLaneHit.lane.y, automationLaneHit.lane.height),
        pointerId: event.pointerId
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const fixedLaneHit = trackLayouts
      .find((entry) => entry.trackId === track.id)
      ?.automationLanes.find((entry) => !entry.automated && y >= entry.y && y <= entry.y + entry.height);
    if (fixedLaneHit?.macroId) {
      pendingLaneActionRef.current = {
        kind: "fixed-slider",
        trackId: track.id,
        macroId: fixedLaneHit.macroId,
        pointerId: event.pointerId
      };
      automationActions.onChangeTrackMacro(track.id, fixedLaneHit.macroId, fixedLaneValueFromX(x));
      canvas.setPointerCapture(event.pointerId);
      setCanvasCursor("resize");
      return;
    }

    if (targets.noteRect) {
      const note = track.notes.find((entry) => entry.id === targets.noteRect?.noteId);
      if (!note) return;

      selectionActions.onSetNoteSelection([getNoteSelectionKey(targets.noteRect.trackId, targets.noteRect.noteId)]);
      const beat = beatFromX(x);
      const nearRightEdge = x > targets.noteRect.x + targets.noteRect.w - noteResizeHandleWidth;
      dragRef.current = {
        trackId: targets.noteRect.trackId,
        noteId: targets.noteRect.noteId,
        mode: nearRightEdge ? "resize" : "move",
        offsetBeats: beat - note.startBeat,
        noteStartBeats: note.startBeat
      };
      setCanvasCursor(nearRightEdge ? "resize" : "move-active");
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (hasActiveSelection) {
      selectionActions.onSetNoteSelection([]);
      selectionActions.onPreviewSelectionActionScopeChange("source");
      setSelectionRect(null);
      selectionActions.onSetSelectionMarqueeActive(false);
      pendingCanvasActionRef.current = null;
      setCanvasCursor("default");
      return;
    }

    pendingCanvasActionRef.current = {
      kind: "track",
      trackId: track.id,
      startX: x,
      startY: y,
      beat: Math.max(0, snapToGrid(beatFromX(x), gridBeats)),
      pointerId: event.pointerId
    };
    setSelectionRect(null);
    selectionActions.onSetSelectionMarqueeActive(false);
    canvas.setPointerCapture(event.pointerId);
  }, [
    automationActions,
    automationKeyframeRectsRef,
    beatFromX,
    canvasRef,
    fixedLaneValueFromX,
    getCanvasPoint,
    getTrackAtY,
    gridBeats,
    headerWidth,
    noteActions,
    noteResizeHandleWidth,
    onRequestTimelineActionsPopover,
    onSetPlayheadBeat,
    playheadBeat,
    resolvePointerTargets,
    selectedNoteKeys,
    selection,
    selectionActions,
    trackActions,
    trackLayouts
  ]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const targets = resolvePointerTargets(x, y);
    const automationKeyframe = findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y);
    const automationLaneHit = targets.automationLaneHit;
    setHoveredPlayhead(automationLaneHit ? false : targets.hoverTarget === "playhead");
    setHoveredLoopMarker((prev) => {
      const next = !automationLaneHit && targets.hoverTarget === "loop-marker" && targets.loopMarkerRect
        ? { markerId: targets.loopMarkerRect.markerId, kind: targets.loopMarkerRect.kind, beat: targets.loopMarkerRect.beat }
        : null;
      return prev?.markerId === next?.markerId && prev?.kind === next?.kind && prev?.beat === next?.beat ? prev : next;
    });
    setHoveredPitch((prev) => {
      const next = targets.pitchRect ? { trackId: targets.pitchRect.trackId, noteId: targets.pitchRect.noteId } : null;
      return prev?.trackId === next?.trackId && prev?.noteId === next?.noteId ? prev : next;
    });
    setHoveredNote((prev) => {
      const next = targets.noteRect || targets.pitchRect
        ? { trackId: (targets.pitchRect ?? targets.noteRect)!.trackId, noteId: (targets.pitchRect ?? targets.noteRect)!.noteId }
        : null;
      return prev?.trackId === next?.trackId && prev?.noteId === next?.noteId ? prev : next;
    });
    setHoveredAutomationKeyframe((prev) => {
      const next = automationKeyframe
        ? {
            trackId: automationKeyframe.trackId,
            macroId: automationKeyframe.macroId,
            keyframeId: automationKeyframe.keyframeId,
            side: automationKeyframe.side
          }
        : null;
      return prev?.trackId === next?.trackId &&
        prev?.macroId === next?.macroId &&
        prev?.keyframeId === next?.keyframeId &&
        prev?.side === next?.side
        ? prev
        : next;
    });

    const drag = dragRef.current;
    const pendingAction = pendingCanvasActionRef.current;
    const automationDrag = automationDragRef.current;
    const pendingLaneAction = pendingLaneActionRef.current;
    if (!drag && !automationDrag && pendingLaneAction?.kind === "fixed-slider") {
      automationActions.onChangeTrackMacro(pendingLaneAction.trackId, pendingLaneAction.macroId, fixedLaneValueFromX(x));
      setCanvasCursor("resize");
      return;
    }
    if (!drag && !automationDrag && pendingLaneAction?.kind === "automation-keyframe") {
      const lane = automationLaneHit?.lane;
      if (!lane) {
        return;
      }
      const nextValue = automationValueFromY(y, lane.y, lane.height);
      pendingLaneActionRef.current = { ...pendingLaneAction, value: nextValue };
      automationActions.onPreviewTrackMacroAutomation(pendingLaneAction.trackId, pendingLaneAction.macroId, nextValue);
      setCanvasCursor("ns-resize");
      return;
    }
    if (!drag && pendingAction) {
      if (pendingAction.kind === "track") {
        if (Math.abs(x - pendingAction.startX) >= 4 || Math.abs(y - pendingAction.startY) >= 4) {
          updateSelectionFromRect({
            startX: pendingAction.startX,
            startY: pendingAction.startY,
            endX: x,
            endY: y
          });
          setCanvasCursor("default");
        }
      } else {
        const startX = headerWidth + pendingAction.startBeat * 72;
        if (Math.abs(x - startX) >= 4) {
          updateTimelineSelectionFromRuler(pendingAction.startBeat, Math.max(0, snapToGrid(beatFromX(x), gridBeats)));
          setCanvasCursor("default");
        }
      }
      return;
    }

    if (automationDrag) {
      const lane = automationLaneHit?.lane ??
        trackLayouts.find((layout) => layout.trackId === automationDrag.trackId)?.automationLanes.find((entry) => entry.laneId === automationDrag.macroId);
      if (!lane) {
        return;
      }
      const nextValue = automationValueFromY(y, lane.y, lane.height);
      automationActions.onPreviewTrackMacroAutomation(automationDrag.trackId, automationDrag.macroId, nextValue);
      if (automationDrag.boundary) {
        automationActions.onUpsertTrackMacroAutomationKeyframe(automationDrag.trackId, automationDrag.macroId, automationDrag.beat, nextValue, { commit: false });
      } else {
        automationActions.onUpdateTrackMacroAutomationKeyframeSide(
          automationDrag.trackId,
          automationDrag.macroId,
          automationDrag.keyframeId,
          automationDrag.side,
          nextValue,
          { commit: false }
        );
      }
      setCanvasCursor("ns-resize");
      return;
    }

    if (!drag) {
      const fixedLaneHit = x >= headerWidth
        ? getTrackLayoutAtY(y)?.automationLanes.find((entry) => !entry.automated && y >= entry.y && y <= entry.y + entry.height)
        : null;
      if (automationKeyframe || automationLaneHit) {
        setCanvasCursor("crosshair");
        return;
      }
      if (fixedLaneHit) {
        setCanvasCursor("resize");
        return;
      }
      setCanvasCursor(
        getCursorForPosition({
          hasMuteHit: Boolean(targets.muteRect),
          hasPitchHit: Boolean(targets.pitchRect),
          hasLoopMarkerHit: Boolean(targets.loopMarkerRect),
          hasPlayheadHit: targets.playheadHit,
          noteRect: targets.noteRect,
          x,
          noteResizeHandleWidth
        })
      );
      return;
    }

    setCanvasCursor(drag.mode === "resize" ? "resize" : "move-active");
    const beat = snapToGrid(Math.max(0, beatFromX(x)), gridBeats);
    const track = project.tracks.find((entry) => entry.id === drag.trackId);
    const note = track?.notes.find((entry) => entry.id === drag.noteId);
    if (!note) {
      return;
    }

    if (drag.mode === "move") {
      noteActions.onUpdateNote(drag.trackId, drag.noteId, { startBeat: Math.max(0, snapToGrid(beat - drag.offsetBeats, gridBeats)) }, {
        actionKey: `track:${drag.trackId}:note:${drag.noteId}:move`,
        coalesce: true
      });
    } else {
      noteActions.onUpdateNote(drag.trackId, drag.noteId, {
        durationBeats: snapToGrid(Math.max(note.startBeat + gridBeats, beat) - note.startBeat, gridBeats)
      }, {
        actionKey: `track:${drag.trackId}:note:${drag.noteId}:resize`,
        coalesce: true
      });
    }
  }, [
    automationActions,
    automationKeyframeRectsRef,
    beatFromX,
    canvasRef,
    fixedLaneValueFromX,
    getCanvasPoint,
    getTrackLayoutAtY,
    gridBeats,
    headerWidth,
    noteActions,
    noteResizeHandleWidth,
    project.tracks,
    resolvePointerTargets,
    trackLayouts,
    updateSelectionFromRect,
    updateTimelineSelectionFromRuler
  ]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const hadDrag = Boolean(dragRef.current);
    const automationDrag = automationDragRef.current;
    const hadAutomationDrag = Boolean(automationDrag);
    const pendingAction = pendingCanvasActionRef.current;
    const pendingLaneAction = pendingLaneActionRef.current;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    if (canvasRef.current && (dragRef.current || pendingAction || automationDragRef.current || pendingLaneAction)) {
      try {
        canvasRef.current.releasePointerCapture(event.pointerId);
      } catch {}
    }
    dragRef.current = null;
    automationDragRef.current = null;
    if (!canvas) {
      pendingCanvasActionRef.current = null;
      pendingLaneActionRef.current = null;
      setCanvasCursor("default");
      return;
    }

    const hadSelectionRect = Boolean(selectionRect);
    if (pendingAction?.kind === "track" && !hadSelectionRect) {
      const newNote = createDefaultPlacedNote(pendingAction.beat, gridBeats);
      noteActions.onUpsertNote(pendingAction.trackId, newNote, {
        actionKey: `track:${pendingAction.trackId}:note:${newNote.id}:create`
      });
      noteActions.onPreviewPlacedNote(pendingAction.trackId, newNote);
    }

    if (pendingLaneAction?.kind === "automation-keyframe") {
      automationActions.onUpsertTrackMacroAutomationKeyframe(
        pendingLaneAction.trackId,
        pendingLaneAction.macroId,
        pendingLaneAction.beat,
        pendingLaneAction.value,
        { commit: true }
      );
      automationActions.onPreviewTrackMacroAutomation(
        pendingLaneAction.trackId,
        pendingLaneAction.macroId,
        pendingLaneAction.value,
        { retrigger: true }
      );
    } else if (pendingLaneAction?.kind === "fixed-slider") {
      automationActions.onChangeTrackMacro(pendingLaneAction.trackId, pendingLaneAction.macroId, fixedLaneValueFromX(x), { commit: true });
    } else if (automationDrag) {
      const lane = trackLayouts
        .find((layout) => layout.trackId === automationDrag.trackId)
        ?.automationLanes.find((entry) => entry.laneId === automationDrag.macroId);
      if (lane) {
        const finalValue = automationValueFromY(y, lane.y, lane.height);
        if (automationDrag.boundary) {
          automationActions.onUpsertTrackMacroAutomationKeyframe(automationDrag.trackId, automationDrag.macroId, automationDrag.beat, finalValue, { commit: true });
        } else {
          automationActions.onUpdateTrackMacroAutomationKeyframeSide(
            automationDrag.trackId,
            automationDrag.macroId,
            automationDrag.keyframeId,
            automationDrag.side,
            finalValue,
            { commit: true }
          );
        }
        automationActions.onPreviewTrackMacroAutomation(automationDrag.trackId, automationDrag.macroId, finalValue, { retrigger: true });
      }
    }

    if (pendingAction?.kind === "ruler") {
      const beat = Math.max(0, snapToGrid(beatFromX(x), gridBeats));
      if (selection.kind === "none") {
        onSetPlayheadBeat(beat);
      } else {
        selectionActions.onPreviewSelectionActionScopeChange("all-tracks");
      }
    }

    pendingCanvasActionRef.current = null;
    pendingLaneActionRef.current = null;
    setSelectionRect(null);
    selectionActions.onSetSelectionMarqueeActive(false);
    const targets = resolvePointerTargets(x, y);
    if (targets.automationLaneHit || findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y)) {
      setCanvasCursor("crosshair");
    } else {
      setCanvasCursor(
        getCursorForPosition({
          hasMuteHit: Boolean(targets.muteRect),
          hasPitchHit: Boolean(targets.pitchRect),
          hasLoopMarkerHit: Boolean(targets.loopMarkerRect),
          hasPlayheadHit: targets.playheadHit,
          noteRect: targets.noteRect,
          x,
          noteResizeHandleWidth
        })
      );
    }
    if (hadDrag || hadAutomationDrag) {
      return;
    }
  }, [
    automationActions,
    automationKeyframeRectsRef,
    beatFromX,
    canvasRef,
    fixedLaneValueFromX,
    getCanvasPoint,
    gridBeats,
    noteActions,
    noteResizeHandleWidth,
    onSetPlayheadBeat,
    resolvePointerTargets,
    selection,
    selectionActions,
    selectionRect,
    trackLayouts
  ]);

  const onPointerLeave = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    onPointerUp(event);
    setHoveredPitch(null);
    setHoveredNote(null);
    setHoveredAutomationKeyframe(null);
    setHoveredLoopMarker(null);
    setHoveredPlayhead(false);
    setCanvasCursor("default");
  }, [onPointerUp]);

  const onDoubleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button !== PRIMARY_POINTER_BUTTON) {
      return;
    }
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const automationKeyframe = findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y);
    if (!automationKeyframe || automationKeyframe.boundary !== null || automationKeyframe.side !== "single") {
      return;
    }
    automationActions.onSplitTrackMacroAutomationKeyframe(
      automationKeyframe.trackId,
      automationKeyframe.macroId,
      automationKeyframe.keyframeId
    );
  }, [automationActions, automationKeyframeRectsRef, getCanvasPoint]);

  return {
    hoveredPitch,
    hoveredNote,
    hoveredAutomationKeyframe,
    hoveredLoopMarker,
    hoveredPlayhead,
    canvasCursor,
    selectionRect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onDoubleClick
  };
}
