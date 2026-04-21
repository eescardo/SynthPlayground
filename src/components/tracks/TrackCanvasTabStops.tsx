"use client";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { TrackCanvasSelectedContentTabStopRect } from "@/components/tracks/trackCanvasSelection";

interface TrackCanvasTabStopsProps {
  playheadLabel: string;
  playheadLeft: number;
  height: number;
  playheadTabStopRef: RefObject<HTMLButtonElement | null>;
  selectedNoteTabStopRef: RefObject<HTMLButtonElement | null>;
  selectedContentRect: TrackCanvasSelectedContentTabStopRect | null;
  onPlayheadFocus: () => void;
  onPlayheadBlur: () => void;
  onSelectedNoteFocus: () => void;
  onSelectedNoteBlur: () => void;
  onReturnSelectedNoteFocusToPlayhead?: () => void;
}

export function TrackCanvasTabStops({
  playheadLabel,
  playheadLeft,
  height,
  playheadTabStopRef,
  selectedNoteTabStopRef,
  selectedContentRect,
  onPlayheadFocus,
  onPlayheadBlur,
  onSelectedNoteFocus,
  onSelectedNoteBlur,
  onReturnSelectedNoteFocusToPlayhead
}: TrackCanvasTabStopsProps) {
  const handleSelectedNoteKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === "Tab" && event.shiftKey) || event.key === "Escape") {
      event.preventDefault();
      onReturnSelectedNoteFocusToPlayhead?.();
      requestAnimationFrame(() => {
        playheadTabStopRef.current?.focus();
      });
    }
  };

  return (
    <>
      <button
        ref={playheadTabStopRef}
        type="button"
        tabIndex={0}
        className="track-canvas-playhead-tabstop"
        aria-label={playheadLabel}
        style={{
          left: playheadLeft,
          height
        }}
        onFocus={onPlayheadFocus}
        onBlur={onPlayheadBlur}
      >
        <span className="track-canvas-tabstop-label">{playheadLabel}</span>
      </button>
      {selectedContentRect && (
        <button
          ref={selectedNoteTabStopRef}
          type="button"
          tabIndex={0}
          className="track-canvas-note-tabstop"
          aria-label={selectedContentRect.ariaLabel}
          style={{
            left: selectedContentRect.x,
            top: selectedContentRect.y,
            width: selectedContentRect.w,
            height: selectedContentRect.h
          }}
          onKeyDown={handleSelectedNoteKeyDown}
          onFocus={onSelectedNoteFocus}
          onBlur={onSelectedNoteBlur}
        >
          <span className="track-canvas-tabstop-label">
            {selectedContentRect.ariaLabel}
          </span>
        </button>
      )}
    </>
  );
}
