"use client";

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { HistoryState } from "@/lib/history";
import { applyProjectChange, reconcileProjectRules, type ProjectChangeOptions } from "@/lib/projectChanges";
import type { Project } from "@/types/music";

export function useAppProjectChanges({
  project,
  setProjectHistory
}: {
  project: Project;
  setProjectHistory: Dispatch<SetStateAction<HistoryState<Project>>>;
}) {
  const commitProjectChange = useCallback(
    (updater: (current: Project) => Project, options?: ProjectChangeOptions) => {
      setProjectHistory((previous) => applyProjectChange(previous, updater, options));
    },
    [setProjectHistory]
  );

  useEffect(() => {
    setProjectHistory(reconcileProjectRules);
  }, [project, setProjectHistory]);

  return { commitProjectChange };
}

export type { CommitProjectChange } from "@/lib/projectChanges";
