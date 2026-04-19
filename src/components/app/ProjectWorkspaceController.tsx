"use client";

import { ComponentProps, ReactNode } from "react";
import { ProjectWorkspaceProvider } from "@/components/patch/ProjectWorkspaceContext";
import { PatchWorkspaceView } from "@/components/app/PatchWorkspaceView";
import { useProjectWorkspaceController, UseProjectWorkspaceControllerOptions } from "@/hooks/patch/useProjectWorkspaceController";

export interface ProjectWorkspaceControllerProps extends UseProjectWorkspaceControllerOptions {
  children: ReactNode | ((viewProps: ComponentProps<typeof PatchWorkspaceView>) => ReactNode);
}

export function ProjectWorkspaceController(props: ProjectWorkspaceControllerProps) {
  const { children, ...controllerOptions } = props;
  const {
    clipboard,
    transport,
    sampleAssets,
    instrument,
    viewProps
  } = useProjectWorkspaceController(controllerOptions);

  return (
    <ProjectWorkspaceProvider
      clipboard={clipboard}
      transport={transport}
      sampleAssets={sampleAssets}
      instrument={instrument}
    >
      {typeof children === "function" ? children(viewProps) : children}
    </ProjectWorkspaceProvider>
  );
}
