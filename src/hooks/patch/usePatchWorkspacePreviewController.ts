"use client";

import { useCallback, useEffect, useRef } from "react";
import { LocalPatchWorkspaceTab, isShortcutBlockedTarget } from "@/hooks/patch/patchWorkspaceStateUtils";

interface UsePatchWorkspacePreviewControllerOptions {
  tabs: LocalPatchWorkspaceTab[];
  activeTab?: LocalPatchWorkspaceTab;
  previewPitch: string;
  previewSelectedPatchNow: (pitch?: string, macroValues?: Record<string, number>) => void;
  setActiveTabId: (tabId: string) => void;
  setSkipWorkspaceHistory: (skipHistory: boolean) => void;
}

export function usePatchWorkspacePreviewController(options: UsePatchWorkspacePreviewControllerOptions) {
  const { activeTab, previewPitch, previewSelectedPatchNow, setActiveTabId, setSkipWorkspaceHistory, tabs } = options;
  const skipNextTabPreviewRef = useRef(true);
  const previousActiveTabIdRef = useRef<string | undefined>(undefined);
  const pendingAutoPreviewTabIdRef = useRef<string | null>(null);

  const activateWorkspaceTab = useCallback(
    (tabId: string, activateOptions?: { preview?: boolean; skipHistory?: boolean }) => {
      skipNextTabPreviewRef.current = activateOptions?.preview === false;
      setSkipWorkspaceHistory(activateOptions?.skipHistory ?? true);
      pendingAutoPreviewTabIdRef.current = activateOptions?.preview === false ? null : tabId;
      setActiveTabId(tabId);
    },
    [setActiveTabId, setSkipWorkspaceHistory]
  );

  const cycleWorkspaceTabs = useCallback(
    (direction: 1 | -1) => {
      if (tabs.length < 2 || !activeTab) {
        return;
      }
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      activateWorkspaceTab(tabs[nextIndex].id);
    },
    [activateWorkspaceTab, activeTab, tabs]
  );

  useEffect(() => {
    if (!activeTab || previousActiveTabIdRef.current === activeTab.id) {
      return;
    }
    const shouldSkipPreview = skipNextTabPreviewRef.current || previousActiveTabIdRef.current === undefined;
    previousActiveTabIdRef.current = activeTab.id;
    skipNextTabPreviewRef.current = false;
    if (shouldSkipPreview) {
      pendingAutoPreviewTabIdRef.current = null;
    }
  }, [activeTab]);

  const handleInstrumentEditorReady = useCallback(
    (renderedMacroValues: Record<string, number>) => {
      if (!activeTab || pendingAutoPreviewTabIdRef.current !== activeTab.id) {
        return;
      }
      pendingAutoPreviewTabIdRef.current = null;
      previewSelectedPatchNow(previewPitch, renderedMacroValues);
    },
    [activeTab, previewPitch, previewSelectedPatchNow]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target)) {
        return;
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.code === "Backquote") {
        event.preventDefault();
        cycleWorkspaceTabs(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleWorkspaceTabs]);

  return {
    activateWorkspaceTab,
    cycleWorkspaceTabs,
    handleInstrumentEditorReady,
    setSkipNextTabPreview(value: boolean) {
      skipNextTabPreviewRef.current = value;
    }
  };
}
