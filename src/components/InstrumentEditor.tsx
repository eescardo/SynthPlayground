"use client";

import { useMemo } from "react";
import { InstrumentToolbar } from "@/components/patch/InstrumentToolbar";
import { PatchEditorCanvas } from "@/components/patch/PatchEditorCanvas";
import { createInstrumentEditorPreviewReadyKey } from "@/components/patch/instrumentEditorPreview";
import { useAfterStateCommit } from "@/hooks/useAfterStateCommit";
import { PatchDiff } from "@/lib/patch/diff";
import { resolvePatchSource } from "@/lib/patch/source";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";

interface InstrumentEditorProps {
  editorSessionKey?: string;
  patch: Patch;
  baselinePatch?: Patch;
  probeState: PatchProbeEditorState;
  macroValues: Record<string, number>;
  patchDiff: PatchDiff;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: PatchValidationIssue[];
  invalid?: boolean;
  migrationNotice?: string | null;
  onReady?: (macroValues: Record<string, number>) => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelectedMacro: () => void;
  onClearPatch: () => void;
  onSetBaselinePatch: () => void;
  onClearBaselinePatch: () => void;
  onApplyOp: (op: PatchOp) => void;
  probeActions: PatchProbeEditorActions;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onAddMacro: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onSetMacroKeyframeCount: (macroId: string, keyframeCount: number) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export function InstrumentEditor(props: InstrumentEditorProps) {
  const { editorSessionKey, invalid, macroValues, onReady, patch } = props;
  const patchSource = resolvePatchSource(props.patch);
  const structureLocked = patchSource === "preset";
  const previewReadyCommitKey = useMemo(
    () => createInstrumentEditorPreviewReadyKey(editorSessionKey, patch.id, macroValues),
    [editorSessionKey, macroValues, patch.id]
  );

  useAfterStateCommit({
    commitKey: previewReadyCommitKey,
    enabled: Boolean(onReady),
    onCommit: () => onReady?.(macroValues)
  });

  return (
    <section className={`instrument-editor${invalid ? " invalid" : ""}`}>
      <InstrumentToolbar patch={props.patch} invalid={props.invalid} />

      {props.migrationNotice && <p className="warn">{props.migrationNotice}</p>}
      {props.invalid && (
        <p className="error">
          This instrument patch is invalid. Track playback may fail until you update the preset or fix the conflicting bindings.
        </p>
      )}

      <PatchEditorCanvas
        patch={props.patch}
        baselinePatch={props.baselinePatch}
        probeState={props.probeState}
        macroValues={props.macroValues}
        patchDiff={props.patchDiff}
        selectedNodeId={props.selectedNodeId}
        selectedMacroId={props.selectedMacroId}
        validationIssues={props.validationIssues}
        structureLocked={structureLocked}
        onSelectNode={props.onSelectNode}
        onSelectMacro={props.onSelectMacro}
        onClearSelectedMacro={props.onClearSelectedMacro}
        onClearPatch={props.onClearPatch}
        onSetBaselinePatch={props.onSetBaselinePatch}
        onClearBaselinePatch={props.onClearBaselinePatch}
        onApplyOp={props.onApplyOp}
        probeActions={props.probeActions}
        onExposeMacro={props.onExposeMacro}
        onAddMacro={props.onAddMacro}
        onRemoveMacro={props.onRemoveMacro}
        onRenameMacro={props.onRenameMacro}
        onSetMacroKeyframeCount={props.onSetMacroKeyframeCount}
        onChangeMacroValue={props.onChangeMacroValue}
      />
    </section>
  );
}
