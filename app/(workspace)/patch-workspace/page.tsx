"use client";

import { useAppRoot } from "@/components/app/AppRoot";
import { PatchWorkspaceController } from "@/components/app/PatchWorkspaceController";

export default function PatchWorkspacePage() {
  const { patchWorkspaceControllerProps } = useAppRoot();
  return <PatchWorkspaceController {...patchWorkspaceControllerProps} />;
}
