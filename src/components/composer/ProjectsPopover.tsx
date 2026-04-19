"use client";

import { RefObject } from "react";

interface ProjectsPopoverProps {
  importInputRef: RefObject<HTMLInputElement | null>;
  onExportJson: () => void;
  onImportJson: () => void;
  onClearProject: () => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
  onClose: () => void;
}

export function ProjectsPopover({
  importInputRef,
  onExportJson,
  onImportJson,
  onClearProject,
  onResetToDefaultProject,
  onImportFile,
  onClose
}: ProjectsPopoverProps) {
  const runAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="projects-popover"
      role="dialog"
      aria-label="Project actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => runAction(onExportJson)}>
        Export Project
      </button>
      <button type="button" onClick={onImportJson}>
        Import Project
      </button>
      <div className="timeline-actions-popover-divider" aria-hidden="true" />
      <button type="button" onClick={() => runAction(onClearProject)}>
        Clear Project
      </button>
      <button type="button" onClick={() => runAction(onResetToDefaultProject)}>
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
            onClose();
          }
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
