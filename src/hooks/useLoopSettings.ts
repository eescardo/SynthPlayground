import { useCallback, useState } from "react";
import { createId } from "@/lib/ids";
import {
  DEFAULT_LOOP_REPEAT_COUNT,
  findLoopBoundaryConflicts,
  getSanitizedLoopMarkers,
  sanitizeLoopSettings,
  splitProjectNotesAtLoopBoundaries
} from "@/lib/looping";
import { Project } from "@/types/music";

interface LoopConflictDialogState {
  nextLoop: Project["global"]["loop"];
  conflicts: ReturnType<typeof findLoopBoundaryConflicts>;
}

interface UseLoopSettingsOptions {
  project: Project;
  commitProjectChange: (updater: (current: Project) => Project, options?: { actionKey?: string; coalesce?: boolean }) => void;
  onCloseLoopPopover: () => void;
}

export function useLoopSettings(options: UseLoopSettingsOptions) {
  const { project, commitProjectChange, onCloseLoopPopover } = options;
  const [loopConflictDialog, setLoopConflictDialog] = useState<LoopConflictDialogState | null>(null);

  const applyLoopSettings = useCallback(
    (nextLoop: Project["global"]["loop"], applyOptions?: { autoSplit?: boolean }) => {
      const sanitizedLoop = sanitizeLoopSettings(nextLoop);
      const candidateProject = {
        ...project,
        global: {
          ...project.global,
          loop: sanitizedLoop
        }
      };
      const conflicts = findLoopBoundaryConflicts(candidateProject, sanitizedLoop);
      if (conflicts.length > 0 && !applyOptions?.autoSplit) {
        setLoopConflictDialog({ nextLoop: sanitizedLoop, conflicts });
        onCloseLoopPopover();
        return;
      }

      const nextProject = conflicts.length > 0 ? splitProjectNotesAtLoopBoundaries(candidateProject, sanitizedLoop) : candidateProject;
      commitProjectChange(() => nextProject, { actionKey: "global:loop" });
      setLoopConflictDialog(null);
      onCloseLoopPopover();
    },
    [commitProjectChange, onCloseLoopPopover, project]
  );

  const removeLoopBoundary = useCallback(
    (markerId: string) => {
      const nextLoop = getSanitizedLoopMarkers(project.global.loop).filter((marker) => marker.id !== markerId);
      applyLoopSettings(nextLoop);
    },
    [applyLoopSettings, project.global.loop]
  );

  const addLoopBoundary = useCallback(
    (beat: number, boundary: "start" | "end", repeatCount = DEFAULT_LOOP_REPEAT_COUNT) => {
      const currentMarkers = getSanitizedLoopMarkers(project.global.loop);
      const nextLoop =
        boundary === "start"
          ? [
              ...currentMarkers,
              {
                id: createId("loop_marker"),
                kind: "start" as const,
                beat
              }
            ]
          : [
              ...currentMarkers,
              {
                id: createId("loop_marker"),
                kind: "end" as const,
                beat,
                repeatCount
              }
            ];
      applyLoopSettings(nextLoop);
    },
    [applyLoopSettings, project.global.loop]
  );

  const updateLoopRepeatCount = useCallback(
    (markerId: string, repeatCount: number) => {
      const nextLoop = getSanitizedLoopMarkers(project.global.loop).map((marker) =>
        marker.id === markerId && marker.kind === "end" ? { ...marker, repeatCount } : marker
      );
      applyLoopSettings(nextLoop);
    },
    [applyLoopSettings, project.global.loop]
  );

  return {
    applyLoopSettings,
    addLoopBoundary,
    updateLoopRepeatCount,
    removeLoopBoundary,
    loopConflictDialog,
    clearLoopConflictDialog: () => setLoopConflictDialog(null)
  };
}
