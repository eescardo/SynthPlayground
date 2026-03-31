"use client";

import { LoopBoundaryConflict } from "@/lib/looping";

interface LoopConflictDialogProps {
  conflicts: LoopBoundaryConflict[];
  trackNameById: Map<string, string>;
  onSplit: () => void;
  onCancel: () => void;
}

export function LoopConflictDialog(props: LoopConflictDialogProps) {
  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={props.onCancel}>
      <div className="help-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Split Notes For Loop</h3>
        <p>
          Some notes cross the proposed loop boundary. Looping would be ambiguous unless those notes are split at the
          boundary.
        </p>
        <div className="loop-conflict-list">
          {props.conflicts.slice(0, 8).map((conflict) => (
            <p key={`${conflict.trackId}:${conflict.noteId}:${conflict.boundary}`}>
              <strong>{props.trackNameById.get(conflict.trackId) ?? conflict.trackId}</strong> · {conflict.pitchStr} from beat {conflict.startBeat + 1} to{" "}
              {conflict.endBeat + 1} crosses the loop {conflict.boundary} at beat {conflict.boundaryBeat + 1}.
            </p>
          ))}
          {props.conflicts.length > 8 && <p>And {props.conflicts.length - 8} more notes.</p>}
        </div>
        <div className="pitch-picker-actions">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" onClick={props.onSplit}>
            Split Notes And Apply Loop
          </button>
        </div>
      </div>
    </div>
  );
}
