"use client";

import { createContext, useContext } from "react";
import { NoteClipboardPayload } from "@/lib/clipboard";
import { ProjectGlobalSettings } from "@/types/music";
import { ProjectAssetLibrary } from "@/types/assets";
import { Patch } from "@/types/patch";

export interface ProjectWorkspaceTransportContextValue {
  tempo: number;
  meter: ProjectGlobalSettings["meter"];
  playheadBeat: number;
}

export interface ProjectWorkspaceSampleAssetsContextValue {
  assets: ProjectAssetLibrary;
  upsertSamplePlayerAssetData: (serializedSampleData: string, existingAssetId?: string | null) => string;
}

export interface ProjectWorkspaceInstrumentContextValue {
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

export interface ProjectWorkspaceProviderProps {
  clipboard?: (payload: NoteClipboardPayload) => Promise<void>;
  transport: ProjectWorkspaceTransportContextValue;
  sampleAssets: ProjectWorkspaceSampleAssetsContextValue;
  instrument: ProjectWorkspaceInstrumentContextValue;
  children: React.ReactNode;
}

const ProjectWorkspaceClipboardContext = createContext<((payload: NoteClipboardPayload) => Promise<void>) | undefined>(undefined);
const ProjectWorkspaceTransportContext = createContext<ProjectWorkspaceTransportContextValue>({
  tempo: 120,
  meter: "4/4",
  playheadBeat: 0
});
const ProjectWorkspaceSampleAssetsContext = createContext<ProjectWorkspaceSampleAssetsContextValue>({
  assets: { samplePlayerById: {} },
  upsertSamplePlayerAssetData: () => ""
});
const ProjectWorkspaceInstrumentContext = createContext<ProjectWorkspaceInstrumentContextValue>({
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

export function ProjectWorkspaceProvider(props: ProjectWorkspaceProviderProps) {
  return (
    <ProjectWorkspaceTransportContext.Provider value={props.transport}>
      <ProjectWorkspaceSampleAssetsContext.Provider value={props.sampleAssets}>
        <ProjectWorkspaceClipboardContext.Provider value={props.clipboard}>
          <ProjectWorkspaceInstrumentContext.Provider value={props.instrument}>
            {props.children}
          </ProjectWorkspaceInstrumentContext.Provider>
        </ProjectWorkspaceClipboardContext.Provider>
      </ProjectWorkspaceSampleAssetsContext.Provider>
    </ProjectWorkspaceTransportContext.Provider>
  );
}

export function useProjectWorkspaceClipboard() {
  return useContext(ProjectWorkspaceClipboardContext);
}

export function useProjectWorkspaceTransport() {
  return useContext(ProjectWorkspaceTransportContext);
}

export function useProjectWorkspaceSampleAssets() {
  return useContext(ProjectWorkspaceSampleAssetsContext);
}

export function useProjectWorkspaceInstrument() {
  return useContext(ProjectWorkspaceInstrumentContext);
}
