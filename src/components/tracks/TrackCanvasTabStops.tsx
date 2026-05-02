"use client";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { TrackCanvasSelectedContentTabStopRect } from "@/components/tracks/trackCanvasSelection";

interface TrackCanvasTabStopsProps {
  playheadLabel: string;
  playheadLeft: number;
  height: number;
  playheadTabStopRef: RefObject<HTMLButtonElement | null>;
  selectedContentTabStopRef: RefObject<HTMLButtonElement | null>;
  selectedContentRect: TrackCanvasSelectedContentTabStopRect | null;
  onPlayheadFocus: () => void;
  onPlayheadBlur: () => void;
  onSelectedContentFocus: () => void;
  onSelectedContentBlur: () => void;
  onReturnSelectedContentFocusToPlayhead?: () => void;
}

export function TrackCanvasTabStops({
  playheadLabel,
  playheadLeft,
  height,
  playheadTabStopRef,
  selectedContentTabStopRef,
  selectedContentRect,
  onPlayheadFocus,
  onPlayheadBlur,
  onSelectedContentFocus,
  onSelectedContentBlur,
  onReturnSelectedContentFocusToPlayhead
}: TrackCanvasTabStopsProps) {
  const handleSelectedContentKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === "Tab" && event.shiftKey) || event.key === "Escape") {
      event.preventDefault();
      onReturnSelectedContentFocusToPlayhead?.();
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
          ref={selectedContentTabStopRef}
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
          onKeyDown={handleSelectedContentKeyDown}
          onFocus={onSelectedContentFocus}
          onBlur={onSelectedContentBlur}
        >
          <span className="track-canvas-tabstop-label">{selectedContentRect.ariaLabel}</span>
        </button>
      )}
    </>
  );
}
