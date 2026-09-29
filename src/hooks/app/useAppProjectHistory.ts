"use client";

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { extendExplicitCompositionEndToLastNote } from "@/lib/compositionEnd";
import { pushHistory, redoHistory, undoHistory, type HistoryState } from "@/lib/history";
import { freezeProjectSnapshot } from "@/lib/projectImmutability";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";
import { createProjectHistory } from "@/hooks/app/useAppBootstrap";
import type { ProjectAssetLibrary } from "@/types/assets";
import type { Project } from "@/types/music";

interface UseAppProjectHistoryOptions {
  project: Project;
  setProjectHistory: Dispatch<SetStateAction<HistoryState<Project>>>;
  setProjectAssets: Dispatch<SetStateAction<ProjectAssetLibrary>>;
}

export function useAppProjectHistory({ project, setProjectHistory, setProjectAssets }: UseAppProjectHistoryOptions) {
  const commitProjectChange = useCallback(
    (
      updater: (current: Project) => Project,
      options?: {
        actionKey?: string;
        coalesce?: boolean;
        onCommitted?: (project: Project) => void;
        skipHistory?: boolean;
      }
    ) => {
      setProjectHistory((prev) => {
        const current = extendExplicitCompositionEndToLastNote(prev.current);
        const next = extendExplicitCompositionEndToLastNote(updater(current));
        if (next === prev.current) {
          return prev;
        }
        const history = current === prev.current ? prev : { ...prev, current: freezeProjectSnapshot(current) };
        const frozenNext = freezeProjectSnapshot(next);
        options?.onCommitted?.(frozenNext);
        if (options?.skipHistory) {
          return {
            ...history,
            current: frozenNext
          };
        }
        return pushHistory(history, frozenNext, options);
      });
    },
    [setProjectHistory]
  );

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

  useEffect(() => {
    setProjectHistory((prev) => {
      const next = extendExplicitCompositionEndToLastNote(prev.current);
      return next === prev.current ? prev : { ...prev, current: freezeProjectSnapshot(next) };
    });
  }, [project, setProjectHistory]);

  return { commitProjectChange, resetProjectState, undoProject, redoProject };
}

export type CommitProjectChange = ReturnType<typeof useAppProjectHistory>["commitProjectChange"];
