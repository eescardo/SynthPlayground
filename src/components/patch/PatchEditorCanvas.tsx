"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { PatchEditorStage } from "@/components/patch/PatchEditorStage";
import { PatchInspector } from "@/components/patch/PatchInspector";
import { PatchMacroPanel } from "@/components/patch/PatchMacroPanel";
import { applyDraftParamValues, buildParamDraftKey } from "@/components/patch/patchEditorCanvasDrafts";
import { PatchEditorSessionActions, PatchEditorSessionModel } from "@/components/patch/patchEditorSession";
import { usePatchCanvasSelection } from "@/hooks/patch/usePatchCanvasSelection";
import { usePatchProbeEditorState } from "@/hooks/patch/usePatchProbeEditorState";
import { clamp } from "@/lib/numeric";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { ParamValue } from "@/types/patch";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";

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
  model: PatchEditorSessionModel;
  actions: PatchEditorSessionActions;
}

export function PatchEditorCanvas(props: PatchEditorCanvasProps) {
  const { actions, model } = props;
  const [draftParamValues, setDraftParamValues] = useState<Record<string, ParamValue>>({});
  const [lastWireCommitFeedback, setLastWireCommitFeedback] = useState<PatchWireCommitFeedback | null>(null);
  useEffect(() => {
    setDraftParamValues({});
  }, [model.patch]);
  const previewPatch = useMemo(
    () => applyDraftParamValues(model.patch, draftParamValues),
    [draftParamValues, model.patch]
  );
  const macroVisibleRows = clamp(
    model.patch.ui.macros.length || 1,
    PATCH_MACRO_VISIBLE_ROW_MIN,
    PATCH_MACRO_VISIBLE_ROW_MAX
  );
  const macroDockHeightRem =
    PATCH_MACRO_DOCK_HEIGHT_REM_BY_ROW_COUNT[macroVisibleRows] ??
    PATCH_MACRO_DOCK_HEIGHT_REM_BY_ROW_COUNT[PATCH_MACRO_VISIBLE_ROW_MAX];
  const selectedMacroNodeIds = useMemo(() => {
    if (!model.selectedMacroId) {
      return new Set<string>();
    }
    return new Set(
      previewPatch.ui.macros
        .find((macro) => macro.id === model.selectedMacroId)
        ?.bindings.map((binding) => binding.nodeId) ?? []
    );
  }, [previewPatch.ui.macros, model.selectedMacroId]);

  const nodeById = useMemo(
    () => new Map([...previewPatch.nodes, ...(previewPatch.ports ?? [])].map((node) => [node.id, node] as const)),
    [previewPatch.nodes, previewPatch.ports]
  );
  const selectedNode = model.selectedNodeId ? nodeById.get(model.selectedNodeId) : undefined;
  const selectedSchema = selectedNode ? getModuleSchema(selectedNode.typeId) : undefined;
  const {
    selectedConnectionId,
    probeActions,
    selectNode: handleSelectNode,
    selectConnection: handleSelectConnection
  } = usePatchCanvasSelection({
    patch: previewPatch,
    selectedNodeId: model.selectedNodeId,
    probeState: model.probeState,
    probeActions: actions.probeActions,
    onSelectNode: actions.onSelectNode
  });
  const { attachingProbeId, cancelAttachProbe, canvasProbeState, selectedProbe, toggleAttachProbe } =
    usePatchProbeEditorState({
      probes: model.probeState.probes,
      probeState: model.probeState,
      probeActions
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
            baselineDiff={model.baselineDiff}
            validationIssues={model.validationIssues}
            probeState={canvasProbeState}
            selectedNodeId={model.selectedNodeId}
            selectedConnectionId={selectedConnectionId}
            selectedMacroNodeIds={selectedMacroNodeIds}
            structureLocked={model.structureLocked}
            onClearPatch={actions.onClearPatch}
            onApplyOp={actions.onApplyOp}
            probeActions={probeActions}
            onSelectNode={handleSelectNode}
            onSelectConnection={handleSelectConnection}
            onToggleAttachProbe={toggleAttachProbe}
            onCancelAttachProbe={cancelAttachProbe}
            onWireCommitFeedback={setLastWireCommitFeedback}
          />

          <PatchMacroPanel
            patch={model.patch}
            patchDiff={model.baselineDiff.patchDiff}
            macroValues={model.macroValues}
            validationIssues={model.validationIssues}
            selectedMacroId={model.selectedMacroId}
            structureLocked={model.structureLocked}
            onAddMacro={actions.onAddMacro}
            onSelectMacro={actions.onSelectMacro}
            onClearSelection={actions.onClearSelectedMacro}
            onRemoveMacro={actions.onRemoveMacro}
            onRenameMacro={actions.onRenameMacro}
            onSetMacroKeyframeCount={actions.onSetMacroKeyframeCount}
            onChangeMacroValue={actions.onChangeMacroValue}
          />
        </div>

        <PatchInspector
          patch={previewPatch}
          patchDiff={model.baselineDiff.patchDiff}
          macroValues={model.macroValues}
          selectedNode={selectedNode}
          selectedProbe={selectedProbe}
          selectedMacroId={model.selectedMacroId}
          selectedSchema={selectedSchema}
          previewCapture={selectedProbe ? model.probeState.previewCaptureByProbeId[selectedProbe.id] : undefined}
          previewProgress={model.probeState.previewProgress}
          attachingProbeId={attachingProbeId}
          wireCommitFeedback={lastWireCommitFeedback}
          selectedConnectionId={selectedConnectionId}
          structureLocked={model.structureLocked}
          validationIssues={model.validationIssues}
          onApplyOp={actions.onApplyOp}
          onSelectMacro={actions.onSelectMacro}
          onChangeMacroValue={actions.onChangeMacroValue}
          onPreviewParamValue={(nodeId, paramId, value) => {
            setDraftParamValues((current) => ({
              ...current,
              [buildParamDraftKey(nodeId, paramId)]: value
            }));
          }}
          onExposeMacro={actions.onExposeMacro}
          onUpdateProbeSpectrumWindow={probeActions.updateSpectrumWindow}
          onUpdateProbeFrequencyView={probeActions.updateFrequencyView}
          onToggleAttachProbe={toggleAttachProbe}
          onClearProbeTarget={(probeId) => probeActions.updateTarget(probeId, undefined)}
        />
      </div>
    </div>
  );
}
