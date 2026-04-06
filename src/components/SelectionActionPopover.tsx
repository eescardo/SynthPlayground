"use client";

interface SelectionActionPopoverProps {
  left: number;
  top: number;
  selectionLabel: string;
  collapsed?: boolean;
  onPreviewScopeChange?: (scope: "source" | "all-tracks") => void;
  onExpand?: () => void;
  onDismiss?: () => void;
  onCut: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onCutAllTracks: () => void;
  onCopyAllTracks: () => void;
  onDeleteAllTracks: () => void;
}

export function SelectionActionPopover(props: SelectionActionPopoverProps) {
  if (props.collapsed) {
    return (
      <div
        className="selection-actions-popover selection-actions-popover-collapsed"
        role="dialog"
        aria-label="Selection actions collapsed"
        style={{ left: props.left, top: props.top }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="selection-actions-popover-collapsed-label">Selection: {props.selectionLabel}</div>
        <button
          type="button"
          className="selection-actions-popover-icon-button"
          aria-label="Expand selection actions"
          onClick={props.onExpand}
        >
          ˅
        </button>
        <button
          type="button"
          className="selection-actions-popover-icon-button"
          aria-label="Dismiss selection actions"
          onClick={props.onDismiss}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      className="selection-actions-popover"
      role="dialog"
      aria-label="Selection actions"
      style={{ left: props.left, top: props.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerLeave={() => props.onPreviewScopeChange?.("source")}
    >
      <div className="selection-actions-popover-header">
        <div className="timeline-actions-popover-label">Selection: {props.selectionLabel}</div>
        <button
          type="button"
          className="selection-actions-popover-icon-button"
          aria-label="Dismiss selection actions"
          onClick={props.onDismiss}
        >
          ×
        </button>
      </div>
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
      <button
        type="button"
        onPointerEnter={() => props.onPreviewScopeChange?.("source")}
        onFocus={() => props.onPreviewScopeChange?.("source")}
        onClick={props.onDelete}
      >
        Delete
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
