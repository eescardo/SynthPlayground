import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { DragEventHandler, KeyboardEvent, RefObject } from "react";
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
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => boolean;
  onWheel: (event: WheelEvent) => void;
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
  onKeyDown,
  onWheel
}: TrackReorderHandleProps) {
  const handleRef = useRef<HTMLButtonElement>(null);
  const revealAfterKeyboardMoveRef = useRef(false);

  const keepFocusedHandleVisible = useCallback(() => {
    const handle = handleRef.current;
    const shell = shellRef.current;
    if (dragging || !handle || !shell || document.activeElement !== handle) {
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    // Scroll events can arrive before the handle's viewport state catches up.
    // Use the live shell offset and current layout rather than its stale DOM top.
    const handleTop = shellRect.top + shell.clientTop + layout.y + layout.height * 0.2 - shell.scrollTop;
    const visibleTop = Math.max(shellRect.top + shell.clientTop + RULER_HEIGHT, 0);
    const visibleBottom = Math.min(shellRect.top + shell.clientTop + shell.clientHeight, window.innerHeight);
    const targetScrollTop = resolveFocusedHandleScrollTop({
      currentScrollTop: shell.scrollTop,
      maxScrollTop: shell.scrollHeight - shell.clientHeight,
      handleTop,
      handleBottom: handleTop + layout.height * 0.6,
      visibleTop,
      visibleBottom
    });
    if (targetScrollTop !== shell.scrollTop) shell.scrollTop = targetScrollTop;
  }, [dragging, layout.height, layout.y, shellRef]);

  useLayoutEffect(() => {
    // Reveal the newly positioned track once after a keyboard move. A focused
    // grip must never pull the viewport back during wheel or scrollbar scrolling.
    if (revealAfterKeyboardMoveRef.current) {
      revealAfterKeyboardMoveRef.current = false;
      keepFocusedHandleVisible();
    }
  });

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) {
      return;
    }
    handle.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => handle.removeEventListener("wheel", onWheel, true);
  }, [onWheel, viewport.height]);

  if (viewport.height === 0) {
    return null;
  }

  const contentTop = viewport.top + viewport.borderTop;
  const top = contentTop + layout.y + layout.height * 0.2 - viewport.scrollTop;
  const height = layout.height * 0.6;
  const visibleTop = Math.max(contentTop + RULER_HEIGHT, 0);
  const visibleBottom = Math.min(contentTop + viewport.height, window.innerHeight);

  // Fixed positioning escapes horizontal clipping while DOM order keeps this
  // control next to its own track's chrome in the native Tab sequence.
  return (
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
        revealAfterKeyboardMoveRef.current = onKeyDown(event);
        if (!shouldPropagateTrackReorderKeyDown(event)) {
          event.stopPropagation();
        }
      }}
    />
  );
}
