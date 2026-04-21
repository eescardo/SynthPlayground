"use client";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { TrackCanvasSelectedNoteTabStopRect } from "@/components/tracks/trackCanvasSelection";

interface TrackCanvasTabStopsProps {
  playheadLabel: string;
  playheadLeft: number;
  height: number;
  playheadTabStopRef: RefObject<HTMLButtonElement | null>;
  selectedNoteTabStopRef: RefObject<HTMLButtonElement | null>;
  selectedNoteRect: TrackCanvasSelectedNoteTabStopRect | null;
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
  selectedNoteRect,
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
      {selectedNoteRect && (
        <button
          ref={selectedNoteTabStopRef}
          type="button"
          tabIndex={0}
          className="track-canvas-note-tabstop"
          aria-label={`Selected note ${selectedNoteRect.pitchStr}`}
          style={{
            left: selectedNoteRect.x,
            top: selectedNoteRect.y,
            width: selectedNoteRect.w,
            height: selectedNoteRect.h
          }}
          onKeyDown={handleSelectedNoteKeyDown}
          onFocus={onSelectedNoteFocus}
          onBlur={onSelectedNoteBlur}
        >
          <span className="track-canvas-tabstop-label">
            Selected note {selectedNoteRect.pitchStr}
          </span>
        </button>
      )}
    </>
  );
}
