import { useCallback, useLayoutEffect, useRef } from "react";
import type { DragEventHandler, KeyboardEventHandler, RefObject } from "react";
import { createPortal } from "react-dom";
import { RULER_HEIGHT } from "./trackCanvasConstants";
import { resolveFocusedHandleScrollTop, shouldPropagateTrackReorderKeyDown } from "./trackReorder";
import type { TrackLayout } from "./trackCanvasTypes";
import styles from "./TrackCanvas.module.css";

interface TrackReorderHandleProps {
  track: { id: string; name: string };
  trackCount: number;
  dragging: boolean;
  groupActive: boolean;
  layout: TrackLayout;
  shellRef: RefObject<HTMLDivElement | null>;
  viewport: { left: number; top: number; scrollTop: number; height: number; borderLeft: number; borderTop: number };
  onDragStart: DragEventHandler<HTMLButtonElement>;
  onDragEnd: DragEventHandler<HTMLButtonElement>;
  onFocusChange: (focused: boolean) => void;
  onHoverChange: (hovered: boolean) => void;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}

export function TrackReorderHandle({
  track,
  trackCount,
  dragging,
  groupActive,
  layout,
  shellRef,
  viewport,
  onDragStart,
  onDragEnd,
  onFocusChange,
  onHoverChange,
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
    const targetScrollTop = resolveFocusedHandleScrollTop({
      currentScrollTop: shell.scrollTop,
      maxScrollTop: shell.scrollHeight - shell.clientHeight,
      handleTop: handleRect.top,
      handleBottom: handleRect.bottom,
      visibleTop,
      visibleBottom
    });
    if (targetScrollTop !== shell.scrollTop) shell.scrollTop = targetScrollTop;
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
      data-group-active={groupActive}
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
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={() => {
        onFocusChange(true);
        keepFocusedHandleVisible();
      }}
      onBlur={() => onFocusChange(false)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        onKeyDown(event);
        if (!shouldPropagateTrackReorderKeyDown(event)) {
          event.stopPropagation();
        }
      }}
    />,
    document.body
  );
}
