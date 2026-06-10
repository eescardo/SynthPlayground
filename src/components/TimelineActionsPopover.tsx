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
  showCompositionEndActions?: boolean;
  compositionEndFollowsLastNote?: boolean;
  compositionEndBeat?: number;
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
  onToggleCompositionEndFollow?: (follow: boolean) => void;
  onUpdateCompositionEndBeat?: (beat: number) => void;
  onClose: () => void;
}

export function TimelineActionsPopover(props: TimelineActionsPopoverProps) {
  const repeatCount = props.endRepeatCount ?? DEFAULT_LOOP_REPEAT_COUNT;
  const hasPasteActions = Boolean(props.showPasteActions);
  const hasPlayheadActions = props.showAddStart || props.showAddEnd || props.showExpandLoopToNotes;
  const hasLoopMarkerActions = Boolean(props.startMarkerId || props.endMarkerId);
  const hasCompositionEndActions = Boolean(props.showCompositionEndActions);
  const showFirstDivider = hasPasteActions && (hasPlayheadActions || hasLoopMarkerActions || hasCompositionEndActions);
  const showSecondDivider =
    !showFirstDivider && hasPlayheadActions && (hasLoopMarkerActions || hasCompositionEndActions);
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

      {props.showCompositionEndActions && (
        <>
          {(props.startMarkerId || props.endMarkerId) && (
            <div className="timeline-actions-popover-divider" aria-hidden="true" />
          )}
          <label className="timeline-composition-end-follow" title={COMPOSITION_END_FOLLOW_TOOLTIP}>
            <input
              type="checkbox"
              checked={props.compositionEndFollowsLastNote !== false}
              onChange={(event) => props.onToggleCompositionEndFollow?.(event.target.checked)}
              aria-label={`Follow last note. ${COMPOSITION_END_FOLLOW_TOOLTIP}`}
            />
            Follow last note
          </label>
          {props.compositionEndFollowsLastNote === false && props.compositionEndBeat !== undefined && (
            <BeatValueControl beat={props.compositionEndBeat} onUpdateBeat={props.onUpdateCompositionEndBeat} />
          )}
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
const COMPOSITION_END_FOLLOW_TOOLTIP =
  "When enabled, the end marker follows only the note with the latest end time. Timeline insert/delete can make a one-time end position override until that latest note changes.";

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

interface TimelineNumberWheelControlProps<ControlId extends string> {
  ariaLabel: string;
  className: string;
  decreaseAriaLabel: string;
  displayValue: string;
  increaseAriaLabel: string;
  inputAriaLabel: string;
  inputMode: "numeric" | "decimal";
  label: string;
  renameId: ControlId;
  title: string;
  onCommitValue: (nextValue: string) => void;
  onStep: (delta: number) => void;
  pattern?: string;
}

function TimelineNumberWheelControl<ControlId extends string>({
  ariaLabel,
  className,
  decreaseAriaLabel,
  displayValue,
  increaseAriaLabel,
  inputAriaLabel,
  inputMode,
  label,
  onCommitValue,
  onStep,
  pattern,
  renameId,
  title
}: TimelineNumberWheelControlProps<ControlId>) {
  const controlRef = useRef<HTMLDivElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const rename = useInlineRename({
    value: displayValue,
    onCommit: onCommitValue
  });
  const { cancel, commit, draft, editing, setDraft, setEditing } = rename;
  const renameActivation = useRenameActivation<ControlId>();
  const startRename = useCallback(() => {
    setEditing(true);
  }, [setEditing]);

  useEffect(() => {
    setDraft(displayValue);
  }, [displayValue, setDraft]);

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
      onStep(-steps);
    },
    [onStep]
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
    <div ref={controlRef} className="timeline-repeat-control" aria-label={ariaLabel}>
      <span className="timeline-actions-popover-label">{label}</span>
      <div className={`timeline-repeat-wheel ${className}`}>
        <button
          type="button"
          className="timeline-repeat-step timeline-repeat-step-up"
          aria-label={increaseAriaLabel}
          onClick={() => onStep(1)}
        />
        {editing ? (
          <input
            className="timeline-repeat-input"
            aria-label={inputAriaLabel}
            autoFocus
            inputMode={inputMode}
            pattern={pattern}
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
            className={`timeline-repeat-value${renameActivation.isArmed(renameId) ? " rename-armed" : ""}`}
            role="button"
            tabIndex={0}
            title={title}
            {...renameActivation.getRenameTriggerProps({
              id: renameId,
              onStartRename: startRename
            })}
          >
            {displayValue}
          </span>
        )}
        <button
          type="button"
          className="timeline-repeat-step timeline-repeat-step-down"
          aria-label={decreaseAriaLabel}
          onClick={() => onStep(-1)}
        />
      </div>
    </div>
  );
}

function LoopRepeatControl({ repeatCount, onUpdateRepeatCount }: LoopRepeatControlProps) {
  const commitRepeatCount = useCallback(
    (nextValue: string) => {
      const parsed = Number(nextValue);
      if (!Number.isFinite(parsed)) {
        return;
      }
      onUpdateRepeatCount(clampRepeatCount(Math.round(parsed)));
    },
    [onUpdateRepeatCount]
  );
  const setRepeatCount = useCallback(
    (delta: number) => {
      onUpdateRepeatCount(clampRepeatCount(repeatCount + delta));
    },
    [onUpdateRepeatCount, repeatCount]
  );

  return (
    <TimelineNumberWheelControl
      ariaLabel="Loop repeats"
      className="timeline-repeat-wheel-loop-repeats"
      decreaseAriaLabel="Decrease loop repeats"
      displayValue={String(repeatCount)}
      increaseAriaLabel="Increase loop repeats"
      inputAriaLabel="Loop repeat count"
      inputMode="numeric"
      label="Loop Repeats"
      pattern="[0-9]*"
      renameId="loop-repeats"
      title="Edit loop repeat count"
      onCommitValue={commitRepeatCount}
      onStep={setRepeatCount}
    />
  );
}

interface BeatValueControlProps {
  beat: number;
  onUpdateBeat?: (beat: number) => void;
}

function BeatValueControl({ beat, onUpdateBeat }: BeatValueControlProps) {
  const value = Number.isInteger(beat) ? String(beat) : beat.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const commitBeat = useCallback(
    (nextValue: string) => {
      const parsed = Number(nextValue);
      if (Number.isFinite(parsed)) {
        onUpdateBeat?.(parsed);
      }
    },
    [onUpdateBeat]
  );
  const setBeat = useCallback(
    (delta: number) => {
      onUpdateBeat?.(beat + delta);
    },
    [beat, onUpdateBeat]
  );

  return (
    <TimelineNumberWheelControl
      ariaLabel="Composition end beat"
      className="timeline-repeat-wheel-end-beat"
      decreaseAriaLabel="Decrease composition end beat"
      displayValue={value}
      increaseAriaLabel="Increase composition end beat"
      inputAriaLabel="Composition end beat"
      inputMode="decimal"
      label="End Beat"
      renameId="composition-end-beat"
      title="Edit composition end beat"
      onCommitValue={commitBeat}
      onStep={setBeat}
    />
  );
}
