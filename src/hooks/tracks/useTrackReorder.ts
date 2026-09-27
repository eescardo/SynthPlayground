"use client";

import { useCallback, useState } from "react";
import type { DragEvent, KeyboardEvent, RefObject } from "react";
import { resolveTrackDropTarget, type TrackDropTarget } from "@/components/tracks/trackReorder";
import type { TrackLayout } from "@/components/tracks/trackCanvasTypes";

export interface TrackReorderDragState extends TrackDropTarget {
  trackId: string;
}

interface UseTrackReorderOptions {
  canvasShellRef: RefObject<HTMLDivElement | null>;
  tracks: Array<{ id: string; name: string }>;
  trackLayouts: TrackLayout[];
  onMoveTrack: (trackId: string, targetTrackId: string, position: "before" | "after") => void;
}

export function useTrackReorder({ canvasShellRef, tracks, trackLayouts, onMoveTrack }: UseTrackReorderOptions) {
  const [dragState, setDragState] = useState<TrackReorderDragState | null>(null);
  const [keyboardAnnouncement, setKeyboardAnnouncement] = useState("");

  const resolveDropTarget = useCallback(
    (clientY: number) => {
      const shell = canvasShellRef.current;
      if (!shell) {
        return null;
      }
      return resolveTrackDropTarget({
        clientY,
        shellTop: shell.getBoundingClientRect().top,
        scrollTop: shell.scrollTop,
        trackLayouts
      });
    },
    [canvasShellRef, trackLayouts]
  );

  const onChromeDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!dragState) {
        return;
      }
      const dropTarget = resolveDropTarget(event.clientY);
      if (!dropTarget) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dragState.targetTrackId !== dropTarget.targetTrackId || dragState.position !== dropTarget.position) {
        setDragState({ trackId: dragState.trackId, ...dropTarget });
      }
    },
    [dragState, resolveDropTarget]
  );

  const onChromeDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!dragState) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const dropTarget = resolveDropTarget(event.clientY);
      if (dropTarget && dragState.trackId !== dropTarget.targetTrackId) {
        onMoveTrack(dragState.trackId, dropTarget.targetTrackId, dropTarget.position);
      }
      setDragState(null);
    },
    [dragState, onMoveTrack, resolveDropTarget]
  );

  const onTrackDragStart = useCallback((event: DragEvent<HTMLElement>, trackId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", trackId);
    setDragState({ trackId, targetTrackId: trackId, position: "before" });
  }, []);

  const onTrackDragEnd = useCallback(() => setDragState(null), []);

  const onTrackReorderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, trackId: string) => {
      const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (direction === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const sourceIndex = tracks.findIndex((track) => track.id === trackId);
      const targetTrack = tracks[sourceIndex + direction];
      const sourceTrack = tracks[sourceIndex];
      if (sourceIndex < 0 || !sourceTrack || !targetTrack) {
        return;
      }
      onMoveTrack(trackId, targetTrack.id, direction < 0 ? "before" : "after");
      setKeyboardAnnouncement(
        `Moved ${sourceTrack.name} to position ${sourceIndex + direction + 1} of ${tracks.length}.`
      );
    },
    [onMoveTrack, tracks]
  );

  return {
    dragState,
    keyboardAnnouncement,
    onChromeDragOver,
    onChromeDrop,
    onTrackDragEnd,
    onTrackDragStart,
    onTrackReorderKeyDown
  };
}
