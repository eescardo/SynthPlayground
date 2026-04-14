"use client";

import { createContext, useContext } from "react";
import { NoteClipboardPayload } from "@/lib/clipboard";

const PatchWorkspaceClipboardContext = createContext<((payload: NoteClipboardPayload) => Promise<void>) | undefined>(undefined);

export function PatchWorkspaceClipboardProvider(props: {
  onWriteClipboardPayload?: (payload: NoteClipboardPayload) => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <PatchWorkspaceClipboardContext.Provider value={props.onWriteClipboardPayload}>
      {props.children}
    </PatchWorkspaceClipboardContext.Provider>
  );
}

export function usePatchWorkspaceClipboard() {
  return useContext(PatchWorkspaceClipboardContext);
}
