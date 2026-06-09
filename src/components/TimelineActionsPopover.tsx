"use client";

import { useCallback, useEffect, useRef, type WheelEvent as ReactWheelEvent } from "react";
import { useFixedPopoverPosition } from "@/hooks/useFixedPopoverPosition";
import { useInlineRename } from "@/hooks/useInlineRename";
import { useRenameActivation } from "@/hooks/useRenameActivation";
import { DEFAULT_LOOP_REPEAT_COUNT, MAX_LOOP_REPEAT_COUNT } from "@/lib/looping";

interface TimelineActionsPopoverProps {
  left: number;
  top: number;
  showPasteActions?: boolean;
  showAddStart: boolean;
  showAddEnd: boolean;
  showExpandLoopToNotes?: boolean;
  startMarkerId?: string;
  endMarkerId?: string;
  endRepeatCount?: number;
  onPaste?: () => void;
  onPasteAllTracks?: () => void;
  onInsert?: () => void;
  onInsertAllTracks?: () => void;
  onAddStart: () => void;
  onAddEnd: () => void;
  onExpandLoopToNotes: () => void;
  onUpdateRepeatCount: (repeatCount: number) => void;
  onRemoveStart: () => void;
  onRemoveEnd: () => void;
  onClose: () => void;
}

export function TimelineActionsPopover(props: TimelineActionsPopoverProps) {
  const repeatCount = props.endRepeatCount ?? DEFAULT_LOOP_REPEAT_COUNT;
  const hasPasteActions = Boolean(props.showPasteActions);
  const hasPlayheadActions = props.showAddStart || props.showAddEnd || props.showExpandLoopToNotes;
  const hasLoopMarkerActions = Boolean(props.startMarkerId || props.endMarkerId);
  const showFirstDivider = hasPasteActions && (hasPlayheadActions || hasLoopMarkerActions);
  const showSecondDivider = !showFirstDivider && hasPlayheadActions && hasLoopMarkerActions;
  const getAnchorPosition = useCallback(() => ({ left: props.left, top: props.top }), [props.left, props.top]);
  const { popoverRef, left, top } = useFixedPopoverPosition<HTMLDivElement>({
    active: true,
    getAnchorPosition
  });
  return (
    <div
      ref={popoverRef}
      className="timeline-actions-popover"
      role="dialog"
      aria-label="Timeline actions"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.showPasteActions && props.onPaste && (
        <button type="button" onClick={props.onPaste}>
          Paste Selected Track(s)
        </button>
      )}

      {props.showPasteActions && props.onPasteAllTracks && (
        <button type="button" onClick={props.onPasteAllTracks}>
          Paste All Tracks
        </button>
      )}

      {props.showPasteActions && props.onInsert && (
        <button type="button" onClick={props.onInsert}>
          Insert Selected Track(s)
        </button>
      )}

      {props.showPasteActions && props.onInsertAllTracks && (
        <button type="button" onClick={props.onInsertAllTracks}>
          Insert All Tracks
        </button>
      )}

      {showFirstDivider && <div className="timeline-actions-popover-divider" aria-hidden="true" />}

      {props.showAddStart && (
        <button type="button" onClick={props.onAddStart}>
          Add Loop Start
        </button>
      )}

      {props.showAddEnd && (
        <button type="button" onClick={props.onAddEnd}>
          Add Loop End
        </button>
      )}

      {props.showExpandLoopToNotes && (
        <button type="button" onClick={props.onExpandLoopToNotes}>
          Explode Loop
        </button>
      )}

      {showSecondDivider && <div className="timeline-actions-popover-divider" aria-hidden="true" />}

      {props.startMarkerId && (
        <button type="button" onClick={props.onRemoveStart}>
          Remove Loop Start
        </button>
      )}

      {props.endMarkerId && (
        <>
          <LoopRepeatControl repeatCount={repeatCount} onUpdateRepeatCount={props.onUpdateRepeatCount} />
          <button type="button" onClick={props.onRemoveEnd}>
            Remove Loop End
          </button>
        </>
      )}

      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </div>
  );
}

interface LoopRepeatControlProps {
  repeatCount: number;
  onUpdateRepeatCount: (repeatCount: number) => void;
}

function clampRepeatCount(value: number): number {
  return Math.min(MAX_LOOP_REPEAT_COUNT, Math.max(DEFAULT_LOOP_REPEAT_COUNT, value));
}

const REPEAT_WHEEL_STEP_DELTA = 96;

function consumeReactWheelEvent(event: ReactWheelEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

function consumeNativeWheelEvent(event: WheelEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function getWheelPixelDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) {
    return deltaY * 16;
  }
  if (deltaMode === 2) {
    return deltaY * 240;
  }
  return deltaY;
}

function LoopRepeatControl({ repeatCount, onUpdateRepeatCount }: LoopRepeatControlProps) {
  const value = String(repeatCount);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const rename = useInlineRename({
    value,
    onCommit: (nextValue) => {
      const parsed = Number(nextValue);
      if (!Number.isFinite(parsed)) {
        return;
      }
      onUpdateRepeatCount(clampRepeatCount(Math.round(parsed)));
    }
  });
  const { cancel, commit, draft, editing, setDraft, setEditing } = rename;
  const renameActivation = useRenameActivation<"loop-repeats">();
  const setRepeatCount = useCallback(
    (delta: number) => {
      onUpdateRepeatCount(clampRepeatCount(repeatCount + delta));
    },
    [onUpdateRepeatCount, repeatCount]
  );
  const startRename = useCallback(() => {
    setEditing(true);
  }, [setEditing]);

  useEffect(() => {
    setDraft(value);
  }, [setDraft, value]);

  const handleWheelDelta = useCallback(
    (deltaY: number, deltaMode: number) => {
      const pixelDeltaY = getWheelPixelDelta(deltaY, deltaMode);
      if (pixelDeltaY === 0) {
        return;
      }
      if (wheelDeltaRef.current !== 0 && Math.sign(wheelDeltaRef.current) !== Math.sign(pixelDeltaY)) {
        wheelDeltaRef.current = 0;
      }
      wheelDeltaRef.current += pixelDeltaY;
      if (Math.abs(wheelDeltaRef.current) < REPEAT_WHEEL_STEP_DELTA) {
        return;
      }
      const steps = Math.trunc(wheelDeltaRef.current / REPEAT_WHEEL_STEP_DELTA);
      wheelDeltaRef.current -= steps * REPEAT_WHEEL_STEP_DELTA;
      onUpdateRepeatCount(clampRepeatCount(repeatCount - steps));
    },
    [onUpdateRepeatCount, repeatCount]
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      consumeNativeWheelEvent(event);
      handleWheelDelta(event.deltaY, event.deltaMode);
    };
    control.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => control.removeEventListener("wheel", onWheel, true);
  }, [handleWheelDelta]);

  return (
    <div ref={controlRef} className="timeline-repeat-control" aria-label="Loop repeats">
      <span className="timeline-actions-popover-label">Loop Repeats</span>
      <div className="timeline-repeat-wheel">
        <button
          type="button"
          className="timeline-repeat-step timeline-repeat-step-up"
          aria-label="Increase loop repeats"
          onClick={() => setRepeatCount(1)}
        />
        {editing ? (
          <input
            className="timeline-repeat-input"
            aria-label="Loop repeat count"
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            size={Math.max(1, draft.length)}
            value={draft}
            onBlur={commit}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
              event.stopPropagation();
            }}
            onWheel={consumeReactWheelEvent}
            onWheelCapture={consumeReactWheelEvent}
          />
        ) : (
          <span
            className={`timeline-repeat-value${renameActivation.isArmed("loop-repeats") ? " rename-armed" : ""}`}
            role="button"
            tabIndex={0}
            title="Edit loop repeat count"
            {...renameActivation.getRenameTriggerProps({
              id: "loop-repeats",
              onStartRename: startRename
            })}
          >
            {repeatCount}
          </span>
        )}
        <button
          type="button"
          className="timeline-repeat-step timeline-repeat-step-down"
          aria-label="Decrease loop repeats"
          onClick={() => setRepeatCount(-1)}
        />
      </div>
    </div>
  );
}
