"use client";

import Link from "next/link";
import { RefObject, useState } from "react";

import { RecentProjectSnapshot } from "@/lib/persistence";
import { UI_TEXT } from "@/lib/uiText";

interface ProjectsPopoverProps {
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  onNewProject: () => void;
  onDeleteCurrentProject: () => void;
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
  onDeleteCurrentProject,
  onExportJson,
  onImportJson,
  onOpenRecentProject,
  onResetToDefaultProject,
  onImportFile,
  onClose
}: ProjectsPopoverProps) {
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

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
      <section className="projects-popover-section" aria-labelledby="projects-popover-section-title">
        <h2 id="projects-popover-section-title" className="projects-popover-section-title">
          Project
        </h2>
        <button type="button" onClick={() => runAction(onNewProject)}>
          New
        </button>
        <button type="button" onClick={() => runAction(onResetToDefaultProject)}>
          New From Template
        </button>
        <div className="projects-popover-delete-wrap">
          <button type="button" onClick={() => setDeleteConfirmationOpen((open) => !open)}>
            Delete Current
          </button>
          {deleteConfirmationOpen && (
            <div className="projects-popover-confirm" role="alertdialog" aria-label="Delete current project">
              <p>{UI_TEXT.projectsMenu.deleteCurrentConfirmation}</p>
              <div className="projects-popover-confirm-actions">
                <button type="button" className="danger-action" onClick={() => runAction(onDeleteCurrentProject)}>
                  Delete
                </button>
                <button type="button" className="secondary-action" onClick={() => setDeleteConfirmationOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="timeline-actions-popover-divider" aria-hidden="true" />
        <button type="button" onClick={() => runAction(onExportJson)}>
          Export
        </button>
        <button type="button" onClick={onImportJson}>
          Import
        </button>
        {recentProjects.length > 0 && (
          <div className="projects-popover-recent-list" aria-label="Recent projects">
            <h3 className="projects-popover-recent-title">Recent</h3>
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
        )}
      </section>
      <Link className="projects-popover-link" href="/about" onClick={onClose}>
        {UI_TEXT.projectsMenu.about}
      </Link>
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
