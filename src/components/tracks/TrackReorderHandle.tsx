import { useCallback, useLayoutEffect, useRef } from "react";
import type { DragEventHandler, KeyboardEventHandler, RefObject } from "react";
import { createPortal } from "react-dom";
import { RULER_HEIGHT } from "./trackCanvasConstants";
import type { TrackLayout } from "./trackCanvasTypes";
import styles from "./TrackCanvas.module.css";

interface TrackReorderHandleProps {
  track: { id: string; name: string };
  trackCount: number;
  dragging: boolean;
  layout: TrackLayout;
  shellRef: RefObject<HTMLDivElement | null>;
  viewport: { left: number; top: number; scrollTop: number; height: number; borderLeft: number; borderTop: number };
  onDragStart: DragEventHandler<HTMLButtonElement>;
  onDragEnd: DragEventHandler<HTMLButtonElement>;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}

export function TrackReorderHandle({
  track,
  trackCount,
  dragging,
  layout,
  shellRef,
  viewport,
  onDragStart,
  onDragEnd,
  onKeyDown
}: TrackReorderHandleProps) {
  const handleRef = useRef<HTMLButtonElement>(null);

  const keepFocusedHandleVisible = useCallback(() => {
    const handle = handleRef.current;
    const shell = shellRef.current;
    if (dragging || !handle || !shell || document.activeElement !== handle) {
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    const visibleTop = Math.max(shellRect.top + shell.clientTop + RULER_HEIGHT, 0);
    const visibleBottom = Math.min(shellRect.top + shell.clientTop + shell.clientHeight, window.innerHeight);
    if (handleRect.top < visibleTop) {
      shell.scrollTop -= visibleTop - handleRect.top;
    } else if (handleRect.bottom > visibleBottom) {
      shell.scrollTop += handleRect.bottom - visibleBottom;
    }
  }, [dragging, shellRef]);

  useLayoutEffect(() => {
    keepFocusedHandleVisible();
  }, [keepFocusedHandleVisible, layout.height, layout.y, viewport.height, viewport.scrollTop, viewport.top]);

  if (viewport.height === 0) {
    return null;
  }

  const contentTop = viewport.top + viewport.borderTop;
  const top = contentTop + layout.y + layout.height * 0.2 - viewport.scrollTop;
  const height = layout.height * 0.6;
  const visibleTop = Math.max(contentTop + RULER_HEIGHT, 0);
  const visibleBottom = Math.min(contentTop + viewport.height, window.innerHeight);

  // Escape the scroll shell's horizontal clipping, but retain its vertical viewport.
  return createPortal(
    <button
      ref={handleRef}
      type="button"
      className={styles.trackDragGrip}
      data-testid="track-reorder-handle"
      data-track-chrome="reorder-handle"
      data-track-id={track.id}
      data-dragging={dragging}
      style={{
        left: viewport.left + viewport.borderLeft,
        top,
        height,
        clipPath: `inset(${Math.max(0, visibleTop - top)}px -4px ${Math.max(0, top + height - visibleBottom)}px -4px)`
      }}
      draggable
      aria-keyshortcuts="ArrowUp ArrowDown"
      aria-label={`Reorder ${track.name}, position ${layout.index + 1} of ${trackCount}. Use Arrow Up or Arrow Down to move.`}
      title={`Drag ${track.name} or use Arrow Up/Down to reorder`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onFocus={keepFocusedHandleVisible}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        onKeyDown(event);
        if (event.key !== "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          event.stopPropagation();
        }
      }}
      onKeyUp={(event) => {
        if (event.key !== "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          event.stopPropagation();
        }
      }}
    />,
    document.body
  );
}
