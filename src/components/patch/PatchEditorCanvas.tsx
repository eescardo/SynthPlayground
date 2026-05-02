"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { PatchEditorStage } from "@/components/patch/PatchEditorStage";
import { PatchInspector } from "@/components/patch/PatchInspector";
import { PatchMacroPanel } from "@/components/patch/PatchMacroPanel";
import { PatchBaselineDiffState } from "@/components/patch/patchBaselineDiffState";
import { applyDraftParamValues, buildParamDraftKey } from "@/components/patch/patchEditorCanvasDrafts";
import { usePatchProbeEditorState } from "@/hooks/patch/usePatchProbeEditorState";
import { clamp } from "@/lib/numeric";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { PatchValidationIssue, Patch, ParamValue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";

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
  baselineDiff: PatchBaselineDiffState;
  probeState: PatchProbeEditorState;
  macroValues: Record<string, number>;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: PatchValidationIssue[];
  structureLocked?: boolean;
  onSelectNode: (nodeId?: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelectedMacro: () => void;
  onClearPatch: () => void;
  onApplyOp: (op: PatchOp) => void;
  probeActions: PatchProbeEditorActions;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onAddMacro: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onSetMacroKeyframeCount: (macroId: string, keyframeCount: number) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export function PatchEditorCanvas(props: PatchEditorCanvasProps) {
  const [draftParamValues, setDraftParamValues] = useState<Record<string, ParamValue>>({});
  useEffect(() => {
    setDraftParamValues({});
  }, [props.patch]);
  const previewPatch = useMemo(() => applyDraftParamValues(props.patch, draftParamValues), [draftParamValues, props.patch]);
  const macroVisibleRows = clamp(props.patch.ui.macros.length || 1, PATCH_MACRO_VISIBLE_ROW_MIN, PATCH_MACRO_VISIBLE_ROW_MAX);
  const macroDockHeightRem =
    PATCH_MACRO_DOCK_HEIGHT_REM_BY_ROW_COUNT[macroVisibleRows] ?? PATCH_MACRO_DOCK_HEIGHT_REM_BY_ROW_COUNT[PATCH_MACRO_VISIBLE_ROW_MAX];
  const selectedMacroNodeIds = useMemo(() => {
    if (!props.selectedMacroId) {
      return new Set<string>();
    }
    return new Set(
      previewPatch.ui.macros
        .find((macro) => macro.id === props.selectedMacroId)
        ?.bindings.map((binding) => binding.nodeId) ?? []
    );
  }, [previewPatch.ui.macros, props.selectedMacroId]);

  const nodeById = useMemo(
    () => new Map([...previewPatch.nodes, ...(previewPatch.ports ?? [])].map((node) => [node.id, node] as const)),
    [previewPatch.nodes, previewPatch.ports]
  );
  const selectedNode = props.selectedNodeId ? nodeById.get(props.selectedNodeId) : undefined;
  const selectedSchema = selectedNode ? getModuleSchema(selectedNode.typeId) : undefined;
  const {
    attachingProbeId,
    cancelAttachProbe,
    canvasProbeState,
    selectedProbe,
    toggleAttachProbe
  } = usePatchProbeEditorState({
    probes: props.probeState.probes,
    probeState: props.probeState,
    probeActions: props.probeActions
  });

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
          <PatchEditorStage
            patch={previewPatch}
            baselineDiff={props.baselineDiff}
            validationIssues={props.validationIssues}
            probeState={canvasProbeState}
            selectedNodeId={props.selectedNodeId}
            selectedMacroNodeIds={selectedMacroNodeIds}
            structureLocked={props.structureLocked}
            onClearPatch={props.onClearPatch}
            onApplyOp={props.onApplyOp}
            probeActions={props.probeActions}
            onSelectNode={props.onSelectNode}
            onToggleAttachProbe={toggleAttachProbe}
            onCancelAttachProbe={cancelAttachProbe}
          />

          <PatchMacroPanel
            patch={props.patch}
            patchDiff={props.baselineDiff.patchDiff}
            macroValues={props.macroValues}
            validationIssues={props.validationIssues}
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
          patch={previewPatch}
          patchDiff={props.baselineDiff.patchDiff}
          macroValues={props.macroValues}
          selectedNode={selectedNode}
          selectedProbe={selectedProbe}
          selectedMacroId={props.selectedMacroId}
          selectedSchema={selectedSchema}
          previewCapture={selectedProbe ? props.probeState.previewCaptureByProbeId[selectedProbe.id] : undefined}
          previewProgress={props.probeState.previewProgress}
          attachingProbeId={attachingProbeId}
          structureLocked={props.structureLocked}
          validationIssues={props.validationIssues}
          onApplyOp={props.onApplyOp}
          onPreviewParamValue={(nodeId, paramId, value) => {
            setDraftParamValues((current) => ({
              ...current,
              [buildParamDraftKey(nodeId, paramId)]: value
            }));
          }}
          onExposeMacro={props.onExposeMacro}
          onUpdateProbeSpectrumWindow={props.probeActions.updateSpectrumWindow}
          onUpdateProbeFrequencyView={props.probeActions.updateFrequencyView}
          onToggleAttachProbe={toggleAttachProbe}
          onClearProbeTarget={(probeId) => props.probeActions.updateTarget(probeId, undefined)}
        />
      </div>
    </div>
  );
}
