import type { ProjectPresetUpdateSummary } from "@/lib/patch/source";

interface PresetUpdateDialogModalProps {
  summary: ProjectPresetUpdateSummary | null;
  open: boolean;
  onCancel: () => void;
  onUpdateAll: () => void;
}

export function PresetUpdateDialogModal({ summary, open, onCancel, onUpdateAll }: PresetUpdateDialogModalProps) {
  if (!open || !summary) {
    return null;
  }

  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" aria-label="Preset updates">
      <div className="help-modal preset-update-modal">
        <h3>Update Presets?</h3>
        <p className="muted">
          {summary.updates.length === 1
            ? "A bundled preset used by this project has a new version."
            : `${summary.updates.length} bundled presets used by this project have new versions.`}
        </p>
        <p>Update all presets?</p>
        <div className="pitch-picker-actions">
          <button type="button" onClick={onCancel}>
            No
          </button>
          <button type="button" onClick={onUpdateAll}>
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
