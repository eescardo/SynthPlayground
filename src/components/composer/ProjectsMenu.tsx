"use client";

import { RefObject, useCallback, useState } from "react";
import { SiteBrand } from "@/components/branding/SiteBrand";
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
  iconOnly?: boolean;
  triggerLabel?: string;
  className?: string;
}

export function ProjectsMenu({
  importInputRef,
  recentProjects,
  onNewProject,
  onExportJson,
  onImportJson,
  onOpenRecentProject,
  onResetToDefaultProject,
  onImportFile,
  iconOnly = false,
  triggerLabel = "Projects",
  className
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
    <div className={["projects-menu", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className={iconOnly ? "projects-menu-trigger projects-menu-trigger-icon" : "projects-menu-trigger"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={() => setOpen((current) => !current)}
      >
        {iconOnly ? <SiteBrand className="projects-menu-brand" /> : "Projects"}
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
