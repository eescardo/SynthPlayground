"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { createProjectSnapshot, hydrateProjectSnapshot } from "@/lib/projectLifecycle";
import { createHistory, HistoryState } from "@/lib/history";
import { freezeProjectSnapshot } from "@/lib/projectImmutability";
import { createDefaultProject, createEmptyProject } from "@/lib/patch/presets";
import {
  loadProjectState,
  loadRecentProjectSnapshots,
  RecentProjectSnapshot,
  saveProjectState
} from "@/lib/persistence";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";
import { createSproutError, SproutError, SproutErrorSetter } from "@/lib/sproutErrors";
import { ProjectAssetLibrary } from "@/types/assets";
import { Project } from "@/types/music";

export const createProjectHistory = (project: Project): HistoryState<Project> => {
  const history = createHistory(project);
  return {
    ...history,
    current: freezeProjectSnapshot(history.current)
  };
};

export function useAppBootstrap({
  setRecentProjects
}: {
  setRecentProjects: Dispatch<SetStateAction<RecentProjectSnapshot[]>>;
}) {
  const [projectHistory, setProjectHistory] = useState<HistoryState<Project>>(() =>
    createProjectHistory(createEmptyProject())
  );
  const [projectAssets, setProjectAssets] = useState<ProjectAssetLibrary>(() => createEmptyProjectAssetLibrary());
  const [ready, setReady] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  const [runtimeError, setRuntimeErrorState] = useState<SproutError | null>(null);
  const setRuntimeError = useCallback<SproutErrorSetter>((value) => {
    setRuntimeErrorState((previous) => (typeof value === "function" ? value(previous) : value));
  }, []);
  const project = projectHistory.current;

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const [savedState, loadedRecentProjects] = await Promise.all([
          loadProjectState(),
          loadRecentProjectSnapshots()
        ]);
        const migratedState = savedState
          ? hydrateProjectSnapshot(savedState.project, savedState.assets)
          : { project: createDefaultProject(), assets: createEmptyProjectAssetLibrary() };
        if (cancelled) {
          return;
        }
        if (savedState) {
          saveProjectState(migratedState.project, migratedState.assets).catch(() => {
            // ignore migration save failures
          });
        }
        setProjectAssets(migratedState.assets);
        setProjectHistory(createProjectHistory(migratedState.project));
        setSelectedTrackId(migratedState.project.tracks[0]?.id);
        setRecentProjects(loadedRecentProjects.filter(({ project }) => project.id !== migratedState.project.id));
        setReady(true);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const fallbackProject = createDefaultProject();
        setProjectAssets(createEmptyProjectAssetLibrary());
        setProjectHistory(createProjectHistory(fallbackProject));
        setSelectedTrackId(fallbackProject.tracks[0]?.id);
        setRecentProjects([]);
        setRuntimeError(
          createSproutError({
            source: "project_bootstrap",
            code: "load_saved_project_failed",
            severity: "error",
            message: `Failed to load the saved project. Loaded the default project instead. ${(error as Error).message}`,
            error: error instanceof Error ? error : new Error(String(error)),
            details: { phase: "load_saved_project" }
          })
        );
        setReady(true);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, [setRecentProjects, setRuntimeError]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      saveProjectState(createProjectSnapshot(project), projectAssets).catch(() => {
        // ignore autosave errors
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [project, projectAssets, ready]);

  return {
    project,
    projectAssets,
    ready,
    runtimeError,
    selectedTrackId,
    setProjectAssets,
    setProjectHistory,
    setRuntimeError,
    setSelectedTrackId
  };
}
