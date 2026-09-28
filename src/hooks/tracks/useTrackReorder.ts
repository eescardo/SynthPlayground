"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, RefObject } from "react";
import {
  resolveTrackDropTarget,
  trackReorderScrollSpeed,
  type TrackDropTarget
} from "@/components/tracks/trackReorder";
import { RULER_HEIGHT } from "@/components/tracks/trackCanvasConstants";
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
  const activeTrackRef = useRef<string | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragging = dragState !== null;
  const [keyboardAnnouncement, setKeyboardAnnouncement] = useState("");
  const keyboardAnnouncementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (keyboardAnnouncementTimerRef.current !== null) {
        clearTimeout(keyboardAnnouncementTimerRef.current);
      }
    },
    []
  );

  const announceKeyboardMove = useCallback((message: string) => {
    if (keyboardAnnouncementTimerRef.current !== null) {
      clearTimeout(keyboardAnnouncementTimerRef.current);
    }
    setKeyboardAnnouncement("");
    keyboardAnnouncementTimerRef.current = setTimeout(() => {
      setKeyboardAnnouncement(message);
      keyboardAnnouncementTimerRef.current = null;
    }, 0);
  }, []);

  const resolveDropTarget = useCallback(
    (clientY: number) => {
      const shell = canvasShellRef.current;
      if (!shell) {
        return null;
      }
      const bounds = shell.getBoundingClientRect();
      return resolveTrackDropTarget({
        clientY,
        shellTop: bounds.top,
        shellBottom: Math.min(bounds.bottom, window.innerHeight),
        scrollTop: shell.scrollTop,
        trackLayouts
      });
    },
    [canvasShellRef, trackLayouts]
  );

  const onTrackDragEnd = useCallback(() => {
    activeTrackRef.current = null;
    pointerRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const updateTarget = (clientY: number) => {
      const target = resolveDropTarget(clientY);
      if (!target) return;
      setDragState((previous) =>
        previous && (previous.targetTrackId !== target.targetTrackId || previous.position !== target.position)
          ? { trackId: previous.trackId, ...target }
          : previous
      );
    };
    // Own the entire in-page drag, including toolbar/child controls and the portal handles.
    // These listeners exist only for a reorder started by our handle, never external drags.
    const onDragOver = (event: globalThis.DragEvent) => {
      if (!activeTrackRef.current) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      pointerRef.current = { x: event.clientX, y: event.clientY };
      updateTarget(event.clientY);
    };
    const onDrop = (event: globalThis.DragEvent) => {
      const trackId = activeTrackRef.current;
      if (!trackId) return;
      event.preventDefault();
      event.stopPropagation();
      const target = resolveDropTarget(event.clientY);
      onTrackDragEnd();
      if (target && trackId !== target.targetTrackId) {
        onMoveTrack(trackId, target.targetTrackId, target.position);
      }
    };
    const onDragLeave = (event: globalThis.DragEvent) => {
      // Native dragleave often has no relatedTarget even between child controls.
      // Only pause for an actual exit from the browser viewport.
      if (
        !event.relatedTarget &&
        (event.clientX <= 0 ||
          event.clientY <= 0 ||
          event.clientX >= window.innerWidth ||
          event.clientY >= window.innerHeight)
      )
        pointerRef.current = null;
    };
    let frame = 0;
    let previousTime = performance.now();
    const scroll = (time: number) => {
      const elapsed = Math.min(time - previousTime, 50) / 1000;
      previousTime = time;
      const shell = canvasShellRef.current;
      const pointer = pointerRef.current;
      if (shell && pointer && activeTrackRef.current) {
        const rect = shell.getBoundingClientRect();
        // Allow the grip's outside half, but don't scroll when dragged away horizontally.
        if (pointer.x >= rect.left - 12 && pointer.x <= rect.right) {
          const top = Math.max(0, rect.top + shell.clientTop + RULER_HEIGHT);
          const bottom = Math.min(window.innerHeight, rect.top + shell.clientTop + shell.clientHeight);
          shell.scrollTop += trackReorderScrollSpeed(pointer.y, top, bottom) * elapsed;
          updateTarget(pointer.y);
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("dragenter", onDragOver, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragend", onTrackDragEnd, true);
    document.addEventListener("dragleave", onDragLeave, true);
    window.addEventListener("blur", onTrackDragEnd);
    frame = requestAnimationFrame(scroll);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("dragenter", onDragOver, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragend", onTrackDragEnd, true);
      document.removeEventListener("dragleave", onDragLeave, true);
      window.removeEventListener("blur", onTrackDragEnd);
    };
  }, [canvasShellRef, dragging, onMoveTrack, onTrackDragEnd, resolveDropTarget]);

  const onTrackDragStart = useCallback((event: DragEvent<HTMLElement>, trackId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", trackId);
    activeTrackRef.current = trackId;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setDragState({ trackId, targetTrackId: trackId, position: "before" });
  }, []);

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
      announceKeyboardMove(`Moved ${sourceTrack.name} to position ${sourceIndex + direction + 1} of ${tracks.length}.`);
    },
    [announceKeyboardMove, onMoveTrack, tracks]
  );

  return {
    dragState,
    keyboardAnnouncement,
    onTrackDragEnd,
    onTrackDragStart,
    onTrackReorderKeyDown
  };
}
