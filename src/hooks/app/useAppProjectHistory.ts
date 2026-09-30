"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { redoHistory, undoHistory, type HistoryState } from "@/lib/history";
import { freezeProjectSnapshot } from "@/lib/projectImmutability";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";
import { createProjectHistory } from "@/hooks/app/useAppBootstrap";
import type { ProjectAssetLibrary } from "@/types/assets";
import type { Project } from "@/types/music";

interface UseAppProjectHistoryOptions {
  setProjectHistory: Dispatch<SetStateAction<HistoryState<Project>>>;
  setProjectAssets: Dispatch<SetStateAction<ProjectAssetLibrary>>;
}

export function useAppProjectHistory({ setProjectHistory, setProjectAssets }: UseAppProjectHistoryOptions) {
  const resetProjectState = useCallback(
    (nextProject: Project, nextAssets: ProjectAssetLibrary = createEmptyProjectAssetLibrary()) => {
      setProjectAssets(nextAssets);
      setProjectHistory(createProjectHistory(nextProject));
    },
    [setProjectAssets, setProjectHistory]
  );

  const undoProject = useCallback(() => {
    setProjectHistory((prev) => {
      const next = undoHistory(prev);
      if (next === prev) {
        return prev;
      }
      return {
        ...next,
        current: freezeProjectSnapshot({
          ...next.current,
          ui: {
            ...prev.current.ui,
            patchWorkspace: next.current.ui.patchWorkspace
          }
        })
      };
    });
  }, [setProjectHistory]);

  const redoProject = useCallback(() => {
    setProjectHistory((prev) => {
      const next = redoHistory(prev);
      if (next === prev) {
        return prev;
      }
      return {
        ...next,
        current: freezeProjectSnapshot({
          ...next.current,
          ui: {
            ...prev.current.ui,
            patchWorkspace: next.current.ui.patchWorkspace
          }
        })
      };
    });
  }, [setProjectHistory]);

  return { resetProjectState, undoProject, redoProject };
}
