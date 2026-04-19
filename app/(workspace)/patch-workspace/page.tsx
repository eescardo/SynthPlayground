"use client";

import { useAppRoot } from "@/components/app/AppRoot";
import { ProjectWorkspaceController } from "@/components/app/ProjectWorkspaceController";
import { PatchWorkspaceView } from "@/components/app/PatchWorkspaceView";

export default function PatchWorkspacePage() {
  const { projectWorkspaceControllerProps } = useAppRoot();
  return (
    <ProjectWorkspaceController {...projectWorkspaceControllerProps}>
      {(viewProps) => <PatchWorkspaceView {...viewProps} />}
    </ProjectWorkspaceController>
  );
}
