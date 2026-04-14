"use client";

import { createContext, useContext } from "react";
import { NoteClipboardPayload } from "@/lib/clipboard";
import { ProjectGlobalSettings } from "@/types/music";

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

export function PatchWorkspaceProvider(props: {
  onWriteClipboardPayload?: (payload: NoteClipboardPayload) => Promise<void>;
  transport: PatchWorkspaceTransportContextValue;
  children: React.ReactNode;
}) {
  return (
    <PatchWorkspaceTransportContext.Provider value={props.transport}>
      <PatchWorkspaceClipboardContext.Provider value={props.onWriteClipboardPayload}>
        {props.children}
      </PatchWorkspaceClipboardContext.Provider>
    </PatchWorkspaceTransportContext.Provider>
  );
}

export function usePatchWorkspaceClipboard() {
  return useContext(PatchWorkspaceClipboardContext);
}

export function usePatchWorkspaceTransport() {
  return useContext(PatchWorkspaceTransportContext);
}
