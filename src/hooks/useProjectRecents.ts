"use client";

import { Dispatch, SetStateAction, useCallback, useState } from "react";
import { loadRecentProjectSnapshots, RecentProjectSnapshot, removeRecentProjectSnapshot } from "@/lib/persistence";

export function useProjectRecents(): {
  recentProjects: RecentProjectSnapshot[];
  setRecentProjects: Dispatch<SetStateAction<RecentProjectSnapshot[]>>;
  refreshRecentProjects: (activeProjectId?: string) => Promise<void>;
} {
  const [recentProjects, setRecentProjects] = useState<RecentProjectSnapshot[]>([]);

  const refreshRecentProjects = useCallback(async (activeProjectId?: string) => {
    const loadedRecentProjects = await loadRecentProjectSnapshots();
    const filteredRecentProjects = activeProjectId
      ? loadedRecentProjects.filter(({ project }) => project.id !== activeProjectId)
      : loadedRecentProjects;

    setRecentProjects(filteredRecentProjects);
    if (activeProjectId && loadedRecentProjects.length !== filteredRecentProjects.length) {
      await removeRecentProjectSnapshot(activeProjectId);
    }
  }, []);

  return {
    recentProjects,
    setRecentProjects,
    refreshRecentProjects
  };
}
