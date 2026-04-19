"use client";

import { createContext, useContext } from "react";
import { NoteClipboardPayload } from "@/lib/clipboard";
import { ProjectGlobalSettings } from "@/types/music";

export interface ProjectWorkspaceTransportContextValue {
  tempo: number;
  meter: ProjectGlobalSettings["meter"];
  gridBeats: number;
  playheadBeat: number;
}

export interface ProjectWorkspaceProviderProps {
  clipboard?: (payload: NoteClipboardPayload) => Promise<void>;
  transport: ProjectWorkspaceTransportContextValue;
  children: React.ReactNode;
}

const ProjectWorkspaceClipboardContext = createContext<((payload: NoteClipboardPayload) => Promise<void>) | undefined>(undefined);
const ProjectWorkspaceTransportContext = createContext<ProjectWorkspaceTransportContextValue>({
  tempo: 120,
  meter: "4/4",
  gridBeats: 0.25,
  playheadBeat: 0
});

export function ProjectWorkspaceProvider(props: ProjectWorkspaceProviderProps) {
  return (
    <ProjectWorkspaceTransportContext.Provider value={props.transport}>
      <ProjectWorkspaceClipboardContext.Provider value={props.clipboard}>
        {props.children}
      </ProjectWorkspaceClipboardContext.Provider>
    </ProjectWorkspaceTransportContext.Provider>
  );
}

export function useProjectWorkspaceClipboard() {
  return useContext(ProjectWorkspaceClipboardContext);
}

export function useProjectWorkspaceTransport() {
  return useContext(ProjectWorkspaceTransportContext);
}
