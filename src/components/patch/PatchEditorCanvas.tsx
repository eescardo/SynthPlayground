"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { PatchInspector } from "@/components/patch/PatchInspector";
import { PatchMacroPanel } from "@/components/patch/PatchMacroPanel";
import { PatchModuleFacePopover } from "@/components/patch/PatchModuleFacePopover";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeTarget, PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

const PATCH_MACRO_VISIBLE_ROW_MIN = 1;
const PATCH_MACRO_VISIBLE_ROW_MAX = 5;
const PATCH_MACRO_DOCK_HEIGHT_REM_BY_ROW_COUNT: Record<number, number> = {
  1: 1.58,
  2: 2.68,
  3: 3.84,
  4: 4.98,
  5: 6.18
};

interface PatchEditorCanvasProps {
  patch: Patch;
  probes: PatchWorkspaceProbeState[];
  selectedProbeId?: string;
  previewCaptureByProbeId: Record<string, PreviewProbeCapture>;
  previewProgress: number;
  macroValues: Record<string, number>;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: PatchValidationIssue[];
  structureLocked?: boolean;
  onSelectNode: (nodeId?: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelectedMacro: () => void;
  onApplyOp: (op: PatchOp) => void;
  onAddProbe: (kind: PatchWorkspaceProbeState["kind"]) => void;
  onMoveProbe: (probeId: string, x: number, y: number) => void;
  onSelectProbe: (probeId?: string) => void;
  onUpdateProbeTarget: (probeId: string, target?: PatchProbeTarget) => void;
  onUpdateProbeSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onDeleteSelectedProbe: () => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onAddMacro: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onSetMacroKeyframeCount: (macroId: string, keyframeCount: number) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export function PatchEditorCanvas(props: PatchEditorCanvasProps) {
  const macroVisibleRows = Math.max(PATCH_MACRO_VISIBLE_ROW_MIN, Math.min(PATCH_MACRO_VISIBLE_ROW_MAX, props.patch.ui.macros.length || 1));
  const macroDockHeightRem =
    PATCH_MACRO_DOCK_HEIGHT_REM_BY_ROW_COUNT[macroVisibleRows] ?? PATCH_MACRO_DOCK_HEIGHT_REM_BY_ROW_COUNT[PATCH_MACRO_VISIBLE_ROW_MAX];
  const selectedMacroNodeIds = useMemo(() => {
    if (!props.selectedMacroId) {
      return new Set<string>();
    }
    return new Set(
      props.patch.ui.macros
        .find((macro) => macro.id === props.selectedMacroId)
        ?.bindings.map((binding) => binding.nodeId) ?? []
    );
  }, [props.patch.ui.macros, props.selectedMacroId]);

  const nodeById = useMemo(() => new Map(props.patch.nodes.map((node) => [node.id, node] as const)), [props.patch.nodes]);
  const selectedNode = props.selectedNodeId ? nodeById.get(props.selectedNodeId) : undefined;
  const selectedSchema = selectedNode ? getModuleSchema(selectedNode.typeId) : undefined;

  return (
    <div
      className="patch-editor"
      style={
        {
          "--patch-macro-visible-rows": macroVisibleRows,
          "--patch-macro-dock-height": `${macroDockHeightRem}rem`
        } as CSSProperties
      }
    >
      <div className="patch-layout">
        <div className="patch-editor-main-column">
          <PatchModuleFacePopover
            patch={props.patch}
            probes={props.probes}
            selectedProbeId={props.selectedProbeId}
            previewCaptureByProbeId={props.previewCaptureByProbeId}
            previewProgress={props.previewProgress}
            selectedNodeId={props.selectedNodeId}
            selectedMacroNodeIds={selectedMacroNodeIds}
            structureLocked={props.structureLocked}
            onApplyOp={props.onApplyOp}
            onAddProbe={props.onAddProbe}
            onMoveProbe={props.onMoveProbe}
            onSelectNode={props.onSelectNode}
            onSelectProbe={props.onSelectProbe}
            onUpdateProbeTarget={props.onUpdateProbeTarget}
            onUpdateProbeSpectrumWindow={props.onUpdateProbeSpectrumWindow}
            onDeleteSelectedProbe={props.onDeleteSelectedProbe}
          />

          <PatchMacroPanel
            patch={props.patch}
            macroValues={props.macroValues}
            selectedMacroId={props.selectedMacroId}
            structureLocked={props.structureLocked}
            onAddMacro={props.onAddMacro}
            onSelectMacro={props.onSelectMacro}
            onClearSelection={props.onClearSelectedMacro}
            onRemoveMacro={props.onRemoveMacro}
            onRenameMacro={props.onRenameMacro}
            onSetMacroKeyframeCount={props.onSetMacroKeyframeCount}
            onChangeMacroValue={props.onChangeMacroValue}
          />
        </div>

        <PatchInspector
          patch={props.patch}
          macroValues={props.macroValues}
          selectedNode={selectedNode}
          selectedMacroId={props.selectedMacroId}
          selectedSchema={selectedSchema}
          structureLocked={props.structureLocked}
          validationIssues={props.validationIssues}
          onApplyOp={props.onApplyOp}
          onExposeMacro={props.onExposeMacro}
        />
      </div>
    </div>
  );
}
