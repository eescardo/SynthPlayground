"use client";

import { createContext, useContext } from "react";
import { ProjectAssetLibrary } from "@/types/assets";
import { Patch } from "@/types/patch";

export interface PatchWorkspaceSampleAssetsContextValue {
  assets: ProjectAssetLibrary;
  upsertSamplePlayerAssetData: (serializedSampleData: string, existingAssetId?: string | null) => string;
}

export interface PatchWorkspaceInstrumentContextValue {
  patches: Patch[];
  canRemovePatch: boolean;
  renamePatch: (name: string) => void;
  selectPatch: (patchId: string) => void;
  duplicatePatch: () => void;
  duplicatePatchToNewTab: () => void;
  exportPatchJson: () => void;
  importPatchFile: (file: File) => void;
  updatePreset: () => void;
  requestRemovePatch: () => void;
}

export interface PatchWorkspaceProviderProps {
  sampleAssets: PatchWorkspaceSampleAssetsContextValue;
  instrument: PatchWorkspaceInstrumentContextValue;
  children: React.ReactNode;
}

const PatchWorkspaceSampleAssetsContext = createContext<PatchWorkspaceSampleAssetsContextValue>({
  assets: { samplePlayerById: {} },
  upsertSamplePlayerAssetData: () => ""
});
const PatchWorkspaceInstrumentContext = createContext<PatchWorkspaceInstrumentContextValue>({
  patches: [],
  canRemovePatch: false,
  renamePatch: () => {},
  selectPatch: () => {},
  duplicatePatch: () => {},
  duplicatePatchToNewTab: () => {},
  exportPatchJson: () => {},
  importPatchFile: () => {},
  updatePreset: () => {},
  requestRemovePatch: () => {}
});

export function PatchWorkspaceProvider(props: PatchWorkspaceProviderProps) {
  return (
    <PatchWorkspaceSampleAssetsContext.Provider value={props.sampleAssets}>
      <PatchWorkspaceInstrumentContext.Provider value={props.instrument}>
        {props.children}
      </PatchWorkspaceInstrumentContext.Provider>
    </PatchWorkspaceSampleAssetsContext.Provider>
  );
}

export function usePatchWorkspaceSampleAssets() {
  return useContext(PatchWorkspaceSampleAssetsContext);
}

export function usePatchWorkspaceInstrument() {
  return useContext(PatchWorkspaceInstrumentContext);
}
