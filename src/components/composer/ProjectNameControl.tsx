"use client";

import { useCallback } from "react";
import { useInlineRename } from "@/hooks/useInlineRename";
import { useRenameActivation } from "@/hooks/useRenameActivation";

interface ProjectNameControlProps {
  name: string;
  onRename: (name: string) => void;
}

export function ProjectNameControl({ name, onRename }: ProjectNameControlProps) {
  const rename = useInlineRename({
    value: name,
    onCommit: onRename
  });
  const renameActivation = useRenameActivation<"project-name">();

  const startRename = useCallback(() => {
    rename.setEditing(true);
  }, [rename]);

  return (
    <div className="transport-project-name-shell">
      {rename.editing ? (
        <input
          className="transport-project-name-input"
          aria-label="Project name"
          autoFocus
          size={Math.max(1, rename.draft.length)}
          value={rename.draft}
          onBlur={rename.commit}
          onChange={(event) => rename.setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              rename.commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              rename.cancel();
            }
            event.stopPropagation();
          }}
        />
      ) : (
        <span
          className={`transport-project-name${renameActivation.isArmed("project-name") ? " rename-armed" : ""}`}
          role="button"
          tabIndex={0}
          {...renameActivation.getRenameTriggerProps({
            id: "project-name",
            onStartRename: startRename
          })}
        >
          {name}
        </span>
      )}
    </div>
  );
}
