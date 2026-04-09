"use client";

import { useAppRoot } from "@/components/app/AppRoot";
import { PatchWorkspaceView } from "@/components/app/PatchWorkspaceView";

export default function PatchWorkspacePage() {
  const { patchWorkspaceProps } = useAppRoot();
  return <PatchWorkspaceView {...patchWorkspaceProps} />;
}
