"use client";

import { RefObject } from "react";

import { RecentProjectSnapshot } from "@/lib/persistence";

interface ProjectsPopoverProps {
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  onNewProject: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
  onClose: () => void;
}

export function ProjectsPopover({
  importInputRef,
  recentProjects,
  onNewProject,
  onExportJson,
  onImportJson,
  onOpenRecentProject,
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
      <button type="button" onClick={() => runAction(onNewProject)}>
        New Project
      </button>
      <button type="button" onClick={() => runAction(onResetToDefaultProject)}>
        New Project From Template
      </button>
      <div className="timeline-actions-popover-divider" aria-hidden="true" />
      <button type="button" onClick={() => runAction(onExportJson)}>
        Export Project
      </button>
      <button type="button" onClick={() => runAction(onImportJson)}>
        Import Project
      </button>
      {recentProjects.length > 0 && (
        <>
          <div className="timeline-actions-popover-divider" aria-hidden="true" />
          <div className="projects-popover-recent-list" aria-label="Recent projects">
            {recentProjects.map(({ project }) => (
              <span
                key={project.id}
                className="projects-popover-recent-label"
                role="button"
                tabIndex={0}
                title={project.name}
                onClick={() => runAction(() => onOpenRecentProject(project.id))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    runAction(() => onOpenRecentProject(project.id));
                  }
                }}
              >
                {project.name}
              </span>
            ))}
          </div>
        </>
      )}
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
