import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { DragEvent, DragEventHandler, KeyboardEvent, RefObject } from "react";
import { RULER_HEIGHT } from "./trackCanvasConstants";
import { resolveFocusedHandleScrollTop } from "./trackReorder";
import type { CanvasShellGeometry } from "@/hooks/tracks/useCanvasShellGeometry";
import type { TrackLayout } from "./trackCanvasTypes";
import styles from "./TrackCanvas.module.css";
import { useComposerInteraction } from "@/components/app/ComposerInteraction";

interface TrackReorderHandleProps {
  track: { id: string; name: string };
  trackCount: number;
  dragging: boolean;
  groupActive: boolean;
  layout: TrackLayout;
  shellRef: RefObject<HTMLDivElement | null>;
  shellGeometry: CanvasShellGeometry;
  onDragStart: (event: DragEvent<HTMLButtonElement>, previousFocus: HTMLElement | null) => void;
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
  shellGeometry,
  onDragStart,
  onDragEnd,
  onFocusChange,
  onHoverChange,
  onKeyDown,
  onWheel
}: TrackReorderHandleProps) {
  const { mode, interaction } = useComposerInteraction();
  const disabled = mode === "playback" || mode === "recording";
  const handleRef = useRef<HTMLButtonElement>(null);
  const focusBeforePressRef = useRef<HTMLElement | null>(null);
  const revealAfterKeyboardMoveRef = useRef(false);
  const suppressFocusReentryRef = useRef(false);
  useEffect(() => {
    return () => {
      interaction.holdReorder(track.id, false);
      interaction.focusReorder(track.id, false);
    };
  }, [interaction, track.id]);

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
    const handle = handleRef.current;
    if (handle && document.activeElement === handle && mode === "editing" && !suppressFocusReentryRef.current) {
      interaction.focusReorder(track.id, true);
      onFocusChange(true);
    }
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
  }, [onWheel, shellGeometry.height]);

  if (shellGeometry.height === 0) {
    return null;
  }

  const contentTop = shellGeometry.top + shellGeometry.borderTop;
  const top = contentTop + layout.y + layout.height * 0.2 - shellGeometry.scrollTop;
  const height = layout.height * 0.6;
  const visibleTop = Math.max(contentTop + RULER_HEIGHT, 0);
  const visibleBottom = Math.min(contentTop + shellGeometry.height, window.innerHeight);

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
        left: shellGeometry.left + shellGeometry.borderLeft,
        top,
        height,
        clipPath: `inset(${Math.max(0, visibleTop - top)}px -4px ${Math.max(0, top + height - visibleBottom)}px -4px)`
      }}
      disabled={disabled}
      draggable={!disabled}
      aria-keyshortcuts="ArrowUp ArrowDown"
      aria-label={`Reorder ${track.name}, position ${layout.index + 1} of ${trackCount}. Use Arrow Up or Arrow Down to move.`}
      title={disabled ? `Reordering unavailable during ${mode}` : `Drag ${track.name} or use Arrow Up/Down to reorder`}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0) return;
        // dragstart runs after the browser has already focused this button.
        focusBeforePressRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!interaction.holdReorder(track.id, true)) event.preventDefault();
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={() => {
        suppressFocusReentryRef.current = false;
        if (!interaction.focusReorder(track.id, true)) return;
        onFocusChange(true);
        keepFocusedHandleVisible();
      }}
      onBlur={() => {
        interaction.focusReorder(track.id, false);
        onFocusChange(false);
      }}
      onDragStart={(event) => {
        const previousFocus = focusBeforePressRef.current;
        focusBeforePressRef.current = null;
        onDragStart(event, previousFocus);
      }}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          suppressFocusReentryRef.current = true;
          interaction.cancelReorder();
          onFocusChange(false);
          // Let Escape's other dismissals settle before returning to the canvas.
          requestAnimationFrame(() => {
            if (interaction.getMode() !== "editing") return;
            const shell = shellRef.current;
            const target =
              shell?.querySelector<HTMLElement>('[data-track-control="selected-content-tabstop"]') ??
              shell?.querySelector<HTMLElement>('[data-track-control="playhead-tabstop"]');
            target?.focus();
          });
          return;
        }
        revealAfterKeyboardMoveRef.current = onKeyDown(event);
      }}
    />
  );
}
