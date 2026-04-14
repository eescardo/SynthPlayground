"use client";

import { createContext, useContext } from "react";
import { NoteClipboardPayload } from "@/lib/clipboard";

const PatchWorkspaceClipboardContext = createContext<((payload: NoteClipboardPayload) => Promise<void>) | undefined>(undefined);
const PatchWorkspaceTempoContext = createContext<number>(120);

export function PatchWorkspaceClipboardProvider(props: {
  onWriteClipboardPayload?: (payload: NoteClipboardPayload) => Promise<void>;
  tempo: number;
  children: React.ReactNode;
}) {
  return (
    <PatchWorkspaceTempoContext.Provider value={props.tempo}>
      <PatchWorkspaceClipboardContext.Provider value={props.onWriteClipboardPayload}>
        {props.children}
      </PatchWorkspaceClipboardContext.Provider>
    </PatchWorkspaceTempoContext.Provider>
  );
}

export function usePatchWorkspaceClipboard() {
  return useContext(PatchWorkspaceClipboardContext);
}

export function usePatchWorkspaceTempo() {
  return useContext(PatchWorkspaceTempoContext);
}
