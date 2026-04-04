"use client";

import { DEFAULT_LOOP_REPEAT_COUNT, MAX_LOOP_REPEAT_COUNT } from "@/lib/looping";

interface TimelineActionsPopoverProps {
  left: number;
  top: number;
  showPasteActions?: boolean;
  showAddStart: boolean;
  showAddEnd: boolean;
  startMarkerId?: string;
  endMarkerId?: string;
  endRepeatCount?: number;
  onPaste?: () => void;
  onPasteAllTracks?: () => void;
  onInsert?: () => void;
  onInsertAllTracks?: () => void;
  onAddStart: () => void;
  onAddEnd: () => void;
  onUpdateRepeatCount: (repeatCount: number) => void;
  onRemoveStart: () => void;
  onRemoveEnd: () => void;
  onClose: () => void;
}

export function TimelineActionsPopover(props: TimelineActionsPopoverProps) {
  const repeatCount = props.endRepeatCount ?? DEFAULT_LOOP_REPEAT_COUNT;
  const hasPasteActions = Boolean(props.showPasteActions);
  const hasPlayheadActions = props.showAddStart || props.showAddEnd;
  const hasLoopMarkerActions = Boolean(props.startMarkerId || props.endMarkerId);
  const showFirstDivider = hasPasteActions && (hasPlayheadActions || hasLoopMarkerActions);
  const showSecondDivider = !showFirstDivider && hasPlayheadActions && hasLoopMarkerActions;

  return (
    <div
      className="timeline-actions-popover"
      role="dialog"
      aria-label="Timeline actions"
      style={{ left: props.left, top: props.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.showPasteActions && props.onPaste && (
        <button type="button" onClick={props.onPaste}>
          Paste
        </button>
      )}

      {props.showPasteActions && props.onPasteAllTracks && (
        <button type="button" onClick={props.onPasteAllTracks}>
          Paste All Tracks
        </button>
      )}

      {props.showPasteActions && props.onInsert && (
        <button type="button" onClick={props.onInsert}>
          Insert
        </button>
      )}

      {props.showPasteActions && props.onInsertAllTracks && (
        <button type="button" onClick={props.onInsertAllTracks}>
          Insert All Tracks
        </button>
      )}

      {showFirstDivider && (
        <div className="timeline-actions-popover-divider" aria-hidden="true" />
      )}

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

      {showSecondDivider && (
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
