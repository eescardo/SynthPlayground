"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { createId } from "@/lib/ids";
import { Project, Track } from "@/types/music";
import {
  getActiveTab,
  LocalPatchWorkspaceTab,
  toLocalTab,
  toPersistedTab
} from "@/hooks/patch/patchWorkspaceStateUtils";

interface UsePatchWorkspaceTabStateOptions {
  project: Project;
  selectedTrack?: Track;
  router: AppRouterInstance;
  patchNameById: Map<string, string>;
  commitProjectChange: (
    updater: (current: Project) => Project,
    options?: { actionKey?: string; coalesce?: boolean; skipHistory?: boolean }
  ) => void;
}

export function usePatchWorkspaceTabState(options: UsePatchWorkspaceTabStateOptions) {
  const { commitProjectChange, patchNameById, project, router, selectedTrack } = options;
  const initialPersistedWorkspace = project.ui.patchWorkspace;
  const [tabs, setTabs] = useState<LocalPatchWorkspaceTab[]>(() => initialPersistedWorkspace.tabs.map(toLocalTab));
  const [activeTabId, setActiveTabId] = useState<string | undefined>(initialPersistedWorkspace.activeTabId);
  const skipNextWorkspaceHistoryRef = useRef(true);
  const projectWorkspaceSignature = JSON.stringify(project.ui.patchWorkspace);
  const workspaceSyncSignatureRef = useRef(projectWorkspaceSignature);

  const createWorkspaceTab = useCallback(
    (patchId: string, name?: string): LocalPatchWorkspaceTab => ({
      id: createId("patchTab"),
      name: name ?? patchNameById.get(patchId) ?? "Instrument",
      patchId,
      probes: [],
      migrationNotice: null
    }),
    [patchNameById]
  );

  useEffect(() => {
    if (projectWorkspaceSignature === workspaceSyncSignatureRef.current) {
      return;
    }
    workspaceSyncSignatureRef.current = projectWorkspaceSignature;
    setTabs(project.ui.patchWorkspace.tabs.map(toLocalTab));
    setActiveTabId(project.ui.patchWorkspace.activeTabId);
  }, [project.ui.patchWorkspace.activeTabId, project.ui.patchWorkspace.tabs, projectWorkspaceSignature]);

  const persistedWorkspaceState = useMemo(
    () => ({
      activeTabId,
      tabs: tabs.map(toPersistedTab)
    }),
    [activeTabId, tabs]
  );
  const persistedWorkspaceSignature = JSON.stringify(persistedWorkspaceState);

  useEffect(() => {
    if (persistedWorkspaceSignature === workspaceSyncSignatureRef.current) {
      return;
    }
    if (persistedWorkspaceSignature === projectWorkspaceSignature) {
      workspaceSyncSignatureRef.current = persistedWorkspaceSignature;
      return;
    }
    workspaceSyncSignatureRef.current = persistedWorkspaceSignature;
    commitProjectChange(
      (current) => ({
        ...current,
        ui: {
          ...current.ui,
          patchWorkspace: persistedWorkspaceState
        }
      }),
      { skipHistory: skipNextWorkspaceHistoryRef.current }
    );
    skipNextWorkspaceHistoryRef.current = true;
  }, [commitProjectChange, persistedWorkspaceSignature, persistedWorkspaceState, projectWorkspaceSignature]);

  const activeTab = useMemo(() => getActiveTab(tabs, activeTabId), [activeTabId, tabs]);

  const updateTabs = useCallback((updater: (currentTabs: LocalPatchWorkspaceTab[]) => LocalPatchWorkspaceTab[]) => {
    setTabs((currentTabs) => updater(currentTabs));
  }, []);

  const updateActiveTab = useCallback(
    (updater: (tab: LocalPatchWorkspaceTab) => LocalPatchWorkspaceTab) => {
      if (!activeTab) {
        return;
      }
      setTabs((currentTabs) => currentTabs.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab)));
    },
    [activeTab]
  );

  useEffect(() => {
    const validPatchIds = new Set(project.patches.map((patch) => patch.id));
    setTabs((currentTabs) => {
      const fallbackPatchId = selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
      if (!fallbackPatchId) {
        return currentTabs;
      }
      const nextTabs = currentTabs
        .filter((tab) => validPatchIds.has(tab.patchId))
        .map((tab) => ({
          ...tab,
          name: tab.name || patchNameById.get(tab.patchId) || "Instrument",
          selectedMacroId:
            tab.selectedMacroId &&
            project.patches
              .find((patch) => patch.id === tab.patchId)
              ?.ui.macros.some((macro) => macro.id === tab.selectedMacroId)
              ? tab.selectedMacroId
              : undefined
        }));
      return nextTabs.length > 0 ? nextTabs : [createWorkspaceTab(fallbackPatchId)];
    });
  }, [createWorkspaceTab, patchNameById, project.patches, selectedTrack?.instrumentPatchId]);

  useEffect(() => {
    if (!activeTabId) {
      if (tabs[0]) {
        setActiveTabId(tabs[0].id);
      }
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id);
    }
  }, [activeTabId, tabs]);

  const closePatchWorkspace = useCallback(() => {
    router.push("/");
  }, [router]);

  return {
    tabs,
    activeTabId,
    activeTab,
    setTabs,
    setActiveTabId,
    updateTabs,
    updateActiveTab,
    createWorkspaceTab,
    closePatchWorkspace,
    skipNextWorkspaceHistoryRef
  };
}
