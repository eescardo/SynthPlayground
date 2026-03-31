"use client";

import { DEFAULT_LOOP_REPEAT_COUNT, MAX_LOOP_REPEAT_COUNT } from "@/lib/looping";

interface LoopPopoverProps {
  left: number;
  top: number;
  target: "playhead" | "start" | "end";
  repeatCount?: number;
  onAddStart: () => void;
  onAddEnd: () => void;
  onUpdateRepeatCount: (repeatCount: number) => void;
  onRemoveStart: () => void;
  onRemoveEnd: () => void;
  onClose: () => void;
}

export function LoopPopover(props: LoopPopoverProps) {
  const repeatCount = props.repeatCount ?? DEFAULT_LOOP_REPEAT_COUNT;

  return (
    <div
      className="loop-popover"
      role="dialog"
      aria-label="Loop controls"
      style={{ left: props.left, top: props.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.target === "playhead" && (
        <>
          <button type="button" onClick={props.onAddStart}>
            Add Loop Start
          </button>
          <button type="button" onClick={props.onAddEnd}>
            Add Loop End
          </button>
        </>
      )}

      {props.target === "start" && (
        <>
          <button type="button" onClick={props.onRemoveStart}>
            Remove Loop Start
          </button>
        </>
      )}

      {props.target === "end" && (
        <>
          <label className="loop-popover-label">
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
