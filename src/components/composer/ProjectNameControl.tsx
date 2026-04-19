"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback } from "react";
import { useHoverArm } from "@/hooks/useHoverArm";
import { useInlineRename } from "@/hooks/useInlineRename";

interface ProjectNameControlProps {
  name: string;
  onRename: (name: string) => void;
}

export function ProjectNameControl({ name, onRename }: ProjectNameControlProps) {
  const rename = useInlineRename({
    value: name,
    onCommit: onRename
  });
  const renameActivation = useHoverArm<"project-name">();

  const startRename = useCallback((event?: ReactMouseEvent | ReactKeyboardEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    renameActivation.disarm("project-name");
    rename.setEditing(true);
  }, [rename, renameActivation]);

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
          onMouseEnter={() => renameActivation.arm("project-name")}
          onMouseLeave={() => renameActivation.disarm("project-name")}
          onClick={(event) => {
            if (!renameActivation.isArmed("project-name")) {
              return;
            }
            startRename(event);
          }}
          onDoubleClick={startRename}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              startRename(event);
            }
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
