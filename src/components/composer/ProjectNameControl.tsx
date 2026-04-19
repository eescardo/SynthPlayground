"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInlineRename } from "@/hooks/useInlineRename";

const PROJECT_RENAME_ARM_DELAY_MS = 1000;

interface ProjectNameControlProps {
  name: string;
  onRename: (name: string) => void;
}

export function ProjectNameControl({ name, onRename }: ProjectNameControlProps) {
  const rename = useInlineRename({
    value: name,
    onCommit: onRename
  });
  const [renameArmed, setRenameArmed] = useState(false);
  const armTimerRef = useRef<number | null>(null);

  const clearRenameArmTimer = useCallback(() => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearRenameArmTimer();
  }, [clearRenameArmTimer]);

  const startRename = useCallback((event?: ReactMouseEvent | ReactKeyboardEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    clearRenameArmTimer();
    setRenameArmed(false);
    rename.setEditing(true);
  }, [clearRenameArmTimer, rename]);

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
          className={`transport-project-name${renameArmed ? " rename-armed" : ""}`}
          role="button"
          tabIndex={0}
          onMouseEnter={() => {
            clearRenameArmTimer();
            armTimerRef.current = window.setTimeout(() => {
              setRenameArmed(true);
            }, PROJECT_RENAME_ARM_DELAY_MS);
          }}
          onMouseLeave={() => {
            clearRenameArmTimer();
            setRenameArmed(false);
          }}
          onClick={(event) => {
            if (!renameArmed) {
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
