import { Dispatch, SetStateAction } from "react";
import { Project } from "@/types/music";

export interface PatchRemovalDialogState {
  patchId: string;
  rows: Array<{ trackId: string; mode: "fallback" | "remove"; fallbackPatchId: string }>;
}

interface PatchRemovalDialogModalProps {
  dialog: PatchRemovalDialogState | null;
  project: Project;
  setDialog: Dispatch<SetStateAction<PatchRemovalDialogState | null>>;
  onConfirm: () => void;
}

export function PatchRemovalDialogModal({ dialog, project, setDialog, onConfirm }: PatchRemovalDialogModalProps) {
  if (!dialog) {
    return null;
  }

  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDialog(null)}>
      <div className="help-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Remove Instrument</h3>
        <p className="muted">Choose how tracks using this custom instrument should be handled before removal.</p>
        {dialog.rows.length === 0 && <p>No tracks currently use this instrument.</p>}
        {dialog.rows.map((row) => {
          const track = project.tracks.find((entry) => entry.id === row.trackId);
          return (
            <div key={row.trackId} className="patch-removal-row">
              <strong>{track?.name ?? row.trackId}</strong>
              <select
                value={row.mode}
                onChange={(event) =>
                  setDialog((prev) =>
                    prev
                      ? {
                          ...prev,
                          rows: prev.rows.map((entry) =>
                            entry.trackId === row.trackId
                              ? { ...entry, mode: event.target.value as "fallback" | "remove" }
                              : entry
                          )
                        }
                      : prev
                  )
                }
              >
                <option value="fallback">Fallback to instrument</option>
                <option value="remove">Remove track</option>
              </select>
              <select
                value={row.fallbackPatchId}
                disabled={row.mode !== "fallback"}
                onChange={(event) =>
                  setDialog((prev) =>
                    prev
                      ? {
                          ...prev,
                          rows: prev.rows.map((entry) =>
                            entry.trackId === row.trackId ? { ...entry, fallbackPatchId: event.target.value } : entry
                          )
                        }
                      : prev
                  )
                }
              >
                {project.patches
                  .filter((patch) => patch.id !== dialog.patchId)
                  .map((patch) => (
                    <option key={patch.id} value={patch.id}>
                      {patch.name}
                    </option>
                  ))}
              </select>
            </div>
          );
        })}
        <div className="pitch-picker-actions">
          <button type="button" onClick={() => setDialog(null)}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            Remove Instrument
          </button>
        </div>
      </div>
    </div>
  );
}
