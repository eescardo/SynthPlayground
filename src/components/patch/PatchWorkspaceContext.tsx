"use client";

import { createContext, useContext } from "react";
import { NoteClipboardPayload } from "@/lib/clipboard";
import { ProjectGlobalSettings } from "@/types/music";
import { ProjectAssetLibrary } from "@/types/assets";

export interface PatchWorkspaceTransportContextValue {
  tempo: number;
  meter: ProjectGlobalSettings["meter"];
  playheadBeat: number;
}

const PatchWorkspaceClipboardContext = createContext<((payload: NoteClipboardPayload) => Promise<void>) | undefined>(undefined);
const PatchWorkspaceTransportContext = createContext<PatchWorkspaceTransportContextValue>({
  tempo: 120,
  meter: "4/4",
  playheadBeat: 0
});
interface PatchWorkspaceSampleAssetsContextValue {
  assets: ProjectAssetLibrary;
  upsertSamplePlayerAssetData: (serializedSampleData: string, existingAssetId?: string | null) => string;
}

const PatchWorkspaceSampleAssetsContext = createContext<PatchWorkspaceSampleAssetsContextValue>({
  assets: { samplePlayerById: {} },
  upsertSamplePlayerAssetData: () => ""
});

export function PatchWorkspaceProvider(props: {
  onWriteClipboardPayload?: (payload: NoteClipboardPayload) => Promise<void>;
  transport: PatchWorkspaceTransportContextValue;
  sampleAssets: PatchWorkspaceSampleAssetsContextValue;
  children: React.ReactNode;
}) {
  return (
    <PatchWorkspaceTransportContext.Provider value={props.transport}>
      <PatchWorkspaceSampleAssetsContext.Provider value={props.sampleAssets}>
        <PatchWorkspaceClipboardContext.Provider value={props.onWriteClipboardPayload}>
          {props.children}
        </PatchWorkspaceClipboardContext.Provider>
      </PatchWorkspaceSampleAssetsContext.Provider>
    </PatchWorkspaceTransportContext.Provider>
  );
}

export function usePatchWorkspaceClipboard() {
  return useContext(PatchWorkspaceClipboardContext);
}

export function usePatchWorkspaceTransport() {
  return useContext(PatchWorkspaceTransportContext);
}

export function usePatchWorkspaceSampleAssets() {
  return useContext(PatchWorkspaceSampleAssetsContext);
}
