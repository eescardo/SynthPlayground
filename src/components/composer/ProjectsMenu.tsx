"use client";

import { RefObject, useCallback, useState } from "react";
import { ProjectsPopover } from "@/components/composer/ProjectsPopover";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";

interface ProjectsMenuProps {
  importInputRef: RefObject<HTMLInputElement | null>;
  onExportJson: () => void;
  onImportJson: () => void;
  onClearProject: () => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
}

export function ProjectsMenu({
  importInputRef,
  onExportJson,
  onImportJson,
  onClearProject,
  onResetToDefaultProject,
  onImportFile
}: ProjectsMenuProps) {
  const [open, setOpen] = useState(false);

  const closeProjectsPopover = useCallback(() => {
    setOpen(false);
  }, []);

  useDismissiblePopover({
    active: open,
    popoverSelector: ".projects-popover, .projects-menu",
    onDismiss: closeProjectsPopover
  });

  return (
    <div className="projects-menu">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Projects
      </button>
      {open && (
        <ProjectsPopover
          importInputRef={importInputRef}
          onExportJson={onExportJson}
          onImportJson={onImportJson}
          onClearProject={onClearProject}
          onResetToDefaultProject={onResetToDefaultProject}
          onImportFile={onImportFile}
          onClose={closeProjectsPopover}
        />
      )}
    </div>
  );
}
