import { Dispatch, MutableRefObject, SetStateAction, useCallback } from "react";
import { toAudioProject } from "@/audio/audioProject";
import { AudioEngine } from "@/audio/engine";
import {
  createClearedProject,
  createNamedEmptyProject,
  createProjectFromDefaultTemplate,
  createProjectSnapshot,
  hydrateProjectSnapshot,
  prepareImportedProject
} from "@/lib/projectLifecycle";
import { RecentProjectSnapshot, removeRecentProjectSnapshot, saveRecentProjectSnapshot } from "@/lib/persistence";
import { importProjectBundleFromJson } from "@/lib/projectSerde";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";
import { ProjectAssetLibrary } from "@/types/assets";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean; skipHistory?: boolean }
) => void;

interface UseProjectLifecycleActionsArgs {
  project: Project;
  projectAssets: ProjectAssetLibrary;
  recentProjects: RecentProjectSnapshot[];
  audioEngineRef: MutableRefObject<AudioEngine | null>;
  playback: {
    stopPlayback: (resetRecordMode?: boolean) => void;
  };
  commitProjectChange: CommitProjectChange;
  resetProjectState: (nextProject: Project, nextAssets?: ProjectAssetLibrary) => void;
  refreshRecentProjects: (activeProjectId?: string) => Promise<void>;
  setSelectedTrackId: Dispatch<SetStateAction<string | undefined>>;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
  clearTransientComposerUi: () => void;
}

export const useProjectLifecycleActions = ({
  project,
  projectAssets,
  recentProjects,
  audioEngineRef,
  playback,
  commitProjectChange,
  resetProjectState,
  refreshRecentProjects,
  setSelectedTrackId,
  setRuntimeError,
  clearTransientComposerUi
}: UseProjectLifecycleActionsArgs) => {
  const activateProjectSnapshot = useCallback(
    (nextProject: Project, nextAssets: ProjectAssetLibrary = createEmptyProjectAssetLibrary()) => {
      clearTransientComposerUi();
      resetProjectState(nextProject, nextAssets);
      setSelectedTrackId(nextProject.tracks[0]?.id);
      audioEngineRef.current?.setProject(toAudioProject(nextProject, nextAssets));
    },
    [audioEngineRef, clearTransientComposerUi, resetProjectState, setSelectedTrackId]
  );

  const switchToProject = useCallback(
    async (
      nextProject: Project,
      nextAssets: ProjectAssetLibrary = createEmptyProjectAssetLibrary(),
      options?: { rememberCurrent?: boolean; removeRecentProjectId?: string }
    ) => {
      playback.stopPlayback();
      if (options?.rememberCurrent) {
        await saveRecentProjectSnapshot(createProjectSnapshot(project), projectAssets);
      }
      if (options?.removeRecentProjectId) {
        await removeRecentProjectSnapshot(options.removeRecentProjectId);
      }
      activateProjectSnapshot(nextProject, nextAssets);
      await refreshRecentProjects(nextProject.id);
    },
    [activateProjectSnapshot, playback, project, projectAssets, refreshRecentProjects]
  );

  const createNewProject = useCallback(async () => {
    const nextProject = createNamedEmptyProject([
      project.name,
      ...recentProjects.map(({ project: recentProject }) => recentProject.name)
    ]);

    await switchToProject(nextProject, createEmptyProjectAssetLibrary(), { rememberCurrent: true });
  }, [project.name, recentProjects, switchToProject]);

  const clearCurrentProject = useCallback(() => {
    playback.stopPlayback();
    const nextProject = createClearedProject(project);

    clearTransientComposerUi();
    commitProjectChange(() => nextProject, { actionKey: "project:clear" });
    setSelectedTrackId(nextProject.tracks[0]?.id);
  }, [clearTransientComposerUi, commitProjectChange, playback, project, setSelectedTrackId]);

  const createDefaultTemplateProject = useCallback(async () => {
    await switchToProject(createProjectFromDefaultTemplate(), createEmptyProjectAssetLibrary(), {
      rememberCurrent: true
    });
  }, [switchToProject]);

  const openRecentProject = useCallback(
    async (projectId: string) => {
      const recentProject = recentProjects.find(({ project: candidate }) => candidate.id === projectId);
      if (!recentProject) {
        return;
      }

      try {
        const migratedState = hydrateProjectSnapshot(recentProject.project, recentProject.assets);

        await switchToProject(migratedState.project, migratedState.assets, {
          rememberCurrent: true,
          removeRecentProjectId: projectId
        });
      } catch (error) {
        setRuntimeError(`Failed to open recent project. ${(error as Error).message}`);
      }
    },
    [recentProjects, setRuntimeError, switchToProject]
  );

  const importJson = useCallback(
    async (file: File) => {
      const text = await file.text();
      try {
        const importedBundle = importProjectBundleFromJson(text);
        const migratedState = hydrateProjectSnapshot(importedBundle.project, importedBundle.assets);
        const importedProject = prepareImportedProject(migratedState.project);

        await switchToProject(importedProject, migratedState.assets, { rememberCurrent: true });
        setRuntimeError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setRuntimeError(`Failed to import project "${file.name}". ${message || "Unknown error."}`);
      }
    },
    [setRuntimeError, switchToProject]
  );

  return {
    clearCurrentProject,
    createNewProject,
    importJson,
    openRecentProject,
    resetToDefaultProject: createDefaultTemplateProject
  };
};
