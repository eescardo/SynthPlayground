"use client";

import { useMemo } from "react";
import {
  ProjectWorkspaceProviderProps,
  ProjectWorkspaceTransportContextValue
} from "@/components/ProjectWorkspaceContext";
import { ComposerView } from "@/components/app/ComposerView";

export interface UseComposerWorkspaceControllerOptions {
  clipboard?: ProjectWorkspaceProviderProps["clipboard"];
  viewProps: React.ComponentProps<typeof ComposerView>;
}

export function useComposerWorkspaceController(options: UseComposerWorkspaceControllerOptions): {
  clipboard: ProjectWorkspaceProviderProps["clipboard"];
  transport: ProjectWorkspaceTransportContextValue;
  viewProps: React.ComponentProps<typeof ComposerView>;
} {
  const transport = useMemo<ProjectWorkspaceTransportContextValue>(
    () => ({
      tempo: options.viewProps.project.global.tempo,
      meter: options.viewProps.project.global.meter,
      gridBeats: options.viewProps.project.global.gridBeats,
      playheadBeat: options.viewProps.playheadBeat
    }),
    [
      options.viewProps.playheadBeat,
      options.viewProps.project.global.gridBeats,
      options.viewProps.project.global.meter,
      options.viewProps.project.global.tempo
    ]
  );

  return {
    clipboard: options.clipboard,
    transport,
    viewProps: options.viewProps
  };
}
