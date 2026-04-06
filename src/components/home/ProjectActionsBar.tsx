import { RefObject } from "react";

interface ProjectActionsBarProps {
  recordingDisabled: boolean;
  canRemoveTrack: boolean;
  onAddTrack: () => void;
  onRemoveTrack: () => void;
  onOpenHelp: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onClearProject: () => void;
  onResetToDefaultProject: () => void;
  importInputRef: RefObject<HTMLInputElement | null>;
  onImportFile: (file: File) => void;
}

export function ProjectActionsBar({
  recordingDisabled,
  canRemoveTrack,
  onAddTrack,
  onRemoveTrack,
  onOpenHelp,
  onExportJson,
  onImportJson,
  onClearProject,
  onResetToDefaultProject,
  importInputRef,
  onImportFile
}: ProjectActionsBarProps) {
  return (
    <section className="top-actions">
      <button disabled={recordingDisabled} onClick={onAddTrack}>Add Track</button>
      <button disabled={recordingDisabled || !canRemoveTrack} onClick={onRemoveTrack}>
        Remove Track
      </button>
      <button onClick={onOpenHelp}>Help (?)</button>
      <button onClick={onExportJson}>Export Project JSON</button>
      <button onClick={onImportJson}>Import Project JSON</button>
      <button onClick={onClearProject}>Clear Project</button>
      <button className="secondary-action" onClick={onResetToDefaultProject}>
        Reset To Default Project
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onImportFile(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </section>
  );
}
