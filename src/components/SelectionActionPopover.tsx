"use client";

interface SelectionActionPopoverProps {
  left: number;
  top: number;
  onCut: () => void;
  onCopy: () => void;
  onCutAllTracks: () => void;
  onCopyAllTracks: () => void;
  onDeleteAllTracks: () => void;
}

export function SelectionActionPopover(props: SelectionActionPopoverProps) {
  return (
    <div
      className="selection-actions-popover"
      role="dialog"
      aria-label="Selection actions"
      style={{ left: props.left, top: props.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={props.onCut}>
        Cut
      </button>
      <button type="button" onClick={props.onCopy}>
        Copy
      </button>

      <div className="timeline-actions-popover-divider" aria-hidden="true" />

      <button type="button" onClick={props.onCutAllTracks}>
        Cut All Tracks
      </button>
      <button type="button" onClick={props.onCopyAllTracks}>
        Copy All Tracks
      </button>
      <button type="button" onClick={props.onDeleteAllTracks}>
        Delete All Tracks
      </button>
    </div>
  );
}
