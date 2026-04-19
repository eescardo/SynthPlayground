"use client";

import { ProjectWorkspaceProvider } from "@/components/patch/ProjectWorkspaceContext";
import { PatchWorkspaceView } from "@/components/app/PatchWorkspaceView";
import { useProjectWorkspaceController, UseProjectWorkspaceControllerOptions } from "@/hooks/patch/useProjectWorkspaceController";

export type ProjectWorkspaceControllerProps = UseProjectWorkspaceControllerOptions;

export function ProjectWorkspaceController(props: ProjectWorkspaceControllerProps) {
  const {
    clipboard,
    transport,
    sampleAssets,
    instrument,
    viewProps
  } = useProjectWorkspaceController(props);

  return (
    <ProjectWorkspaceProvider
      clipboard={clipboard}
      transport={transport}
      sampleAssets={sampleAssets}
      instrument={instrument}
    >
      <PatchWorkspaceView {...viewProps} />
    </ProjectWorkspaceProvider>
  );
}
