"use client";

import { useCallback, useState } from "react";
import { LocalPatchWorkspaceTab } from "@/hooks/patch/patchWorkspaceStateUtils";
import { createPatchWorkspaceProbe } from "@/lib/patch/probes";
import {
  PatchProbeFrequencyView,
  PatchProbeTarget,
  PatchWorkspaceProbeState,
  PreviewProbeCapture
} from "@/types/probes";

interface UsePatchWorkspaceProbeStateOptions {
  activeTab?: LocalPatchWorkspaceTab;
  updateActiveTab: (updater: (tab: LocalPatchWorkspaceTab) => LocalPatchWorkspaceTab) => void;
}

export function usePatchWorkspaceProbeState({ activeTab, updateActiveTab }: UsePatchWorkspaceProbeStateOptions) {
  const [previewCaptureByProbeId, setPreviewCaptureByProbeId] = useState<Record<string, PreviewProbeCapture>>({});
  const probes = activeTab?.probes ?? [];
  const selectedProbeId = activeTab?.selectedProbeId;

  const clearPreviewCaptures = useCallback(() => {
    setPreviewCaptureByProbeId({});
  }, []);

  const addProbeToWorkspace = useCallback(
    (kind: PatchWorkspaceProbeState["kind"], position?: { x: number; y: number }) => {
      if (!activeTab) {
        return;
      }
      const nextProbe = createPatchWorkspaceProbe(
        kind,
        position?.x ?? 4,
        position?.y ?? 4 + activeTab.probes.length * 7
      );
      updateActiveTab((tab) => ({
        ...tab,
        selectedNodeId: undefined,
        selectedMacroId: undefined,
        selectedProbeId: nextProbe.id,
        probes: [...tab.probes, nextProbe]
      }));
    },
    [activeTab, updateActiveTab]
  );

  const setSelectedProbeId = useCallback(
    (probeId?: string) => {
      updateActiveTab((tab) => ({
        ...tab,
        selectedNodeId: undefined,
        selectedMacroId: undefined,
        selectedProbeId: probeId
      }));
    },
    [updateActiveTab]
  );

  const updateProbeState = useCallback(
    (probeId: string, updater: (probe: PatchWorkspaceProbeState) => PatchWorkspaceProbeState) => {
      updateActiveTab((tab) => ({
        ...tab,
        probes: tab.probes.map((probe) => (probe.id === probeId ? updater(probe) : probe))
      }));
    },
    [updateActiveTab]
  );

  const moveProbe = useCallback(
    (probeId: string, x: number, y: number) => {
      updateProbeState(probeId, (probe) => ({ ...probe, x, y }));
    },
    [updateProbeState]
  );

  const updateProbeTarget = useCallback(
    (probeId: string, target?: PatchProbeTarget) => {
      updateActiveTab((tab) => ({
        ...tab,
        selectedProbeId: probeId,
        probes: tab.probes.map((probe) => (probe.id === probeId ? { ...probe, target } : probe))
      }));
    },
    [updateActiveTab]
  );

  const updateProbeSpectrumWindow = useCallback(
    (probeId: string, spectrumWindowSize: number) => {
      updateProbeState(probeId, (probe) => ({ ...probe, spectrumWindowSize }));
    },
    [updateProbeState]
  );

  const updateProbeFrequencyView = useCallback(
    (probeId: string, frequencyView: PatchProbeFrequencyView) => {
      updateProbeState(probeId, (probe) => ({ ...probe, frequencyView }));
    },
    [updateProbeState]
  );

  const toggleProbeExpanded = useCallback(
    (probeId: string) => {
      updateProbeState(probeId, (probe) => ({ ...probe, expanded: !probe.expanded }));
    },
    [updateProbeState]
  );

  const removeSelectedProbe = useCallback(() => {
    const selectedProbeId = activeTab?.selectedProbeId;
    if (!selectedProbeId) {
      return;
    }
    updateActiveTab((tab) => ({
      ...tab,
      selectedProbeId: undefined,
      probes: tab.probes.filter((probe) => probe.id !== tab.selectedProbeId)
    }));
    setPreviewCaptureByProbeId((current) => {
      const next = { ...current };
      delete next[selectedProbeId];
      return next;
    });
  }, [activeTab, updateActiveTab]);

  return {
    probes,
    selectedProbeId,
    previewCaptureByProbeId,
    setPreviewCaptureByProbeId,
    clearPreviewCaptures,
    setSelectedProbeId,
    addProbeToWorkspace,
    moveProbe,
    updateProbeTarget,
    updateProbeSpectrumWindow,
    updateProbeFrequencyView,
    toggleProbeExpanded,
    removeSelectedProbe
  };
}
