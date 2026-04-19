"use client";

import { RefObject, useCallback, useState } from "react";
import { ProjectsPopover } from "@/components/composer/ProjectsPopover";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { RecentProjectSnapshot } from "@/lib/persistence";

interface ProjectsMenuProps {
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  onNewProject: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
}

export function ProjectsMenu({
  importInputRef,
  recentProjects,
  onNewProject,
  onExportJson,
  onImportJson,
  onOpenRecentProject,
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
          recentProjects={recentProjects}
          onNewProject={onNewProject}
          onExportJson={onExportJson}
          onImportJson={onImportJson}
          onOpenRecentProject={onOpenRecentProject}
          onResetToDefaultProject={onResetToDefaultProject}
          onImportFile={onImportFile}
          onClose={closeProjectsPopover}
        />
      )}
    </div>
  );
}
