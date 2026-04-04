"use client";

interface SelectionActionPopoverProps {
  left: number;
  top: number;
  sourceTrackName: string;
  onPreviewScopeChange?: (scope: "source" | "all-tracks") => void;
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
      onPointerLeave={() => props.onPreviewScopeChange?.("source")}
    >
      <div className="timeline-actions-popover-label">Source Track: {props.sourceTrackName}</div>
      <button
        type="button"
        onPointerEnter={() => props.onPreviewScopeChange?.("source")}
        onFocus={() => props.onPreviewScopeChange?.("source")}
        onClick={props.onCut}
      >
        Cut
      </button>
      <button
        type="button"
        onPointerEnter={() => props.onPreviewScopeChange?.("source")}
        onFocus={() => props.onPreviewScopeChange?.("source")}
        onClick={props.onCopy}
      >
        Copy
      </button>

      <div className="timeline-actions-popover-divider" aria-hidden="true" />

      <button
        type="button"
        onPointerEnter={() => props.onPreviewScopeChange?.("all-tracks")}
        onFocus={() => props.onPreviewScopeChange?.("all-tracks")}
        onClick={props.onCutAllTracks}
      >
        Cut All Tracks
      </button>
      <button
        type="button"
        onPointerEnter={() => props.onPreviewScopeChange?.("all-tracks")}
        onFocus={() => props.onPreviewScopeChange?.("all-tracks")}
        onClick={props.onCopyAllTracks}
      >
        Copy All Tracks
      </button>
      <button
        type="button"
        onPointerEnter={() => props.onPreviewScopeChange?.("all-tracks")}
        onFocus={() => props.onPreviewScopeChange?.("all-tracks")}
        onClick={props.onDeleteAllTracks}
      >
        Delete All Tracks
      </button>
    </div>
  );
}
