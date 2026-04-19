"use client";

import { useAppRoot } from "@/components/app/AppRoot";
import { ProjectWorkspaceController } from "@/components/app/ProjectWorkspaceController";

export default function PatchWorkspacePage() {
  const { projectWorkspaceControllerProps } = useAppRoot();
  return <ProjectWorkspaceController {...projectWorkspaceControllerProps} />;
}
