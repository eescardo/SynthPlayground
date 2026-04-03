"use client";

import { DEFAULT_LOOP_REPEAT_COUNT, MAX_LOOP_REPEAT_COUNT } from "@/lib/looping";

interface TimelineActionsPopoverProps {
  left: number;
  top: number;
  showAddStart: boolean;
  showAddEnd: boolean;
  startMarkerId?: string;
  endMarkerId?: string;
  endRepeatCount?: number;
  onAddStart: () => void;
  onAddEnd: () => void;
  onUpdateRepeatCount: (repeatCount: number) => void;
  onRemoveStart: () => void;
  onRemoveEnd: () => void;
  onClose: () => void;
}

export function TimelineActionsPopover(props: TimelineActionsPopoverProps) {
  const repeatCount = props.endRepeatCount ?? DEFAULT_LOOP_REPEAT_COUNT;
  const hasPlayheadActions = props.showAddStart || props.showAddEnd;
  const hasLoopMarkerActions = Boolean(props.startMarkerId || props.endMarkerId);

  return (
    <div
      className="timeline-actions-popover"
      role="dialog"
      aria-label="Timeline actions"
      style={{ left: props.left, top: props.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
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

      {hasPlayheadActions && hasLoopMarkerActions && (
        <div className="timeline-actions-popover-divider" aria-hidden="true" />
      )}

      {props.startMarkerId && (
        <button type="button" onClick={props.onRemoveStart}>
          Remove Loop Start
        </button>
      )}

      {props.endMarkerId && (
        <>
          <label className="timeline-actions-popover-label">
            Loop Repeats
            <input
              type="number"
              min={DEFAULT_LOOP_REPEAT_COUNT}
              max={MAX_LOOP_REPEAT_COUNT}
              value={repeatCount}
              onChange={(event) => props.onUpdateRepeatCount(Number(event.target.value))}
            />
          </label>
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
