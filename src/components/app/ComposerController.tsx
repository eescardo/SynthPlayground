"use client";

import { ProjectWorkspaceProvider, ProjectWorkspaceProviderProps } from "@/components/ProjectWorkspaceContext";
import { ComposerView } from "@/components/app/ComposerView";
import { useComposerWorkspaceController } from "@/hooks/useComposerWorkspaceController";

export interface ComposerControllerProps {
  clipboard?: ProjectWorkspaceProviderProps["clipboard"];
  viewProps: React.ComponentProps<typeof ComposerView>;
}

export function ComposerController(props: ComposerControllerProps) {
  const { clipboard, transport, viewProps } = useComposerWorkspaceController(props);

  return (
    <ProjectWorkspaceProvider clipboard={clipboard} transport={transport}>
      <ComposerView {...viewProps} />
    </ProjectWorkspaceProvider>
  );
}
