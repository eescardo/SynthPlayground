"use client";

import { useEffect, useMemo, useState } from "react";
import { PatchProbeEditorActions, PatchProbeEditorState, PatchWorkspaceProbeState } from "@/types/probes";

interface UsePatchProbeEditorStateArgs {
  probes: PatchWorkspaceProbeState[];
  probeState: PatchProbeEditorState;
  probeActions: PatchProbeEditorActions;
}

export function usePatchProbeEditorState(args: UsePatchProbeEditorStateArgs) {
  const [attachingProbeId, setAttachingProbeId] = useState<string | null>(null);
  const probeById = useMemo(() => new Map(args.probes.map((probe) => [probe.id, probe] as const)), [args.probes]);
  const selectedProbe = args.probeState.selectedProbeId ? probeById.get(args.probeState.selectedProbeId) : undefined;

  useEffect(() => {
    if (attachingProbeId && !probeById.has(attachingProbeId)) {
      setAttachingProbeId(null);
    }
  }, [attachingProbeId, probeById]);

  useEffect(() => {
    if (!attachingProbeId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAttachingProbeId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attachingProbeId]);

  const toggleAttachProbe = (probeId: string) => {
    args.probeActions.selectProbe(probeId);
    setAttachingProbeId((current) => (current === probeId ? null : probeId));
  };

  const cancelAttachProbe = () => setAttachingProbeId(null);

  const canvasProbeState = useMemo(
    () => ({
      ...args.probeState,
      attachingProbeId
    }),
    [args.probeState, attachingProbeId]
  );

  return {
    attachingProbeId,
    cancelAttachProbe,
    canvasProbeState,
    probeById,
    selectedProbe,
    toggleAttachProbe
  };
}
