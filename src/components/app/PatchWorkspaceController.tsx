"use client";

import { PatchWorkspaceView } from "@/components/app/PatchWorkspaceView";
import { ProjectWorkspaceProvider } from "@/components/ProjectWorkspaceContext";
import { PatchWorkspaceProvider } from "@/components/patch/PatchWorkspaceContext";
import {
  usePatchWorkspaceController,
  UsePatchWorkspaceControllerOptions
} from "@/hooks/patch/usePatchWorkspaceController";

export type PatchWorkspaceControllerProps = UsePatchWorkspaceControllerOptions;

export function PatchWorkspaceController(props: PatchWorkspaceControllerProps) {
  const { clipboard, transport, sampleAssets, instrument, viewProps } = usePatchWorkspaceController(props);

  return (
    <ProjectWorkspaceProvider clipboard={clipboard} transport={transport}>
      <PatchWorkspaceProvider sampleAssets={sampleAssets} instrument={instrument}>
        <PatchWorkspaceView {...viewProps} />
      </PatchWorkspaceProvider>
    </ProjectWorkspaceProvider>
  );
}
