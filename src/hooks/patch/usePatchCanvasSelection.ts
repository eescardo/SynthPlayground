import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Patch } from "@/types/patch";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";

interface UsePatchCanvasSelectionArgs {
  patch: Patch;
  selectedNodeId?: string;
  probeState: PatchProbeEditorState;
  probeActions: PatchProbeEditorActions;
  onSelectNode: (nodeId?: string) => void;
}

export function usePatchCanvasSelection(args: UsePatchCanvasSelectionArgs) {
  const { onSelectNode, patch, probeActions: sourceProbeActions } = args;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | undefined>();
  const previousSelectedNodeIdRef = useRef(args.selectedNodeId);
  const previousSelectedProbeIdRef = useRef(args.probeState.selectedProbeId);

  useEffect(() => {
    if (selectedConnectionId && !patch.connections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(undefined);
    }
  }, [patch.connections, selectedConnectionId]);

  useEffect(() => {
    const nodeSelectionChanged = previousSelectedNodeIdRef.current !== args.selectedNodeId;
    const probeSelectionChanged = previousSelectedProbeIdRef.current !== args.probeState.selectedProbeId;
    previousSelectedNodeIdRef.current = args.selectedNodeId;
    previousSelectedProbeIdRef.current = args.probeState.selectedProbeId;
    if (
      selectedConnectionId &&
      ((nodeSelectionChanged && args.selectedNodeId) || (probeSelectionChanged && args.probeState.selectedProbeId))
    ) {
      setSelectedConnectionId(undefined);
    }
  }, [args.probeState.selectedProbeId, args.selectedNodeId, selectedConnectionId]);

  const selectNode = useCallback(
    (nodeId?: string) => {
      setSelectedConnectionId(undefined);
      onSelectNode(nodeId);
    },
    [onSelectNode]
  );

  const probeActions = useMemo<PatchProbeEditorActions>(
    () => ({
      ...sourceProbeActions,
      addProbe: (kind, position) => {
        setSelectedConnectionId(undefined);
        sourceProbeActions.addProbe(kind, position);
      },
      selectProbe: (probeId) => {
        setSelectedConnectionId(undefined);
        sourceProbeActions.selectProbe(probeId);
      }
    }),
    [sourceProbeActions]
  );

  const selectConnection = useCallback(
    (connectionId?: string) => {
      setSelectedConnectionId(connectionId);
      if (connectionId) {
        onSelectNode(undefined);
        sourceProbeActions.selectProbe(undefined);
      }
    },
    [onSelectNode, sourceProbeActions]
  );

  return {
    selectedConnectionId,
    probeActions,
    selectNode,
    selectConnection
  };
}
