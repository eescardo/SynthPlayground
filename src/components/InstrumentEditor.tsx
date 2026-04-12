"use client";

import { useMemo } from "react";
import { InstrumentToolbar } from "@/components/patch/InstrumentToolbar";
import { PatchEditorCanvas } from "@/components/patch/PatchEditorCanvas";
import { createInstrumentEditorPreviewReadyKey } from "@/components/patch/instrumentEditorPreview";
import { useAfterStateCommit } from "@/hooks/useAfterStateCommit";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface InstrumentEditorProps {
  editorSessionKey?: string;
  patch: Patch;
  patches: Patch[];
  macroValues: Record<string, number>;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: PatchValidationIssue[];
  invalid?: boolean;
  migrationNotice?: string | null;
  onReady?: (macroValues: Record<string, number>) => void;
  onRenamePatch: (name: string) => void;
  onSelectPatch: (patchId: string) => void;
  onDuplicatePatch: () => void;
  onDuplicatePatchToNewTab: () => void;
  onUpdatePreset: () => void;
  canRemovePatch: boolean;
  onRequestRemovePatch: () => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelectedMacro: () => void;
  onApplyOp: (op: PatchOp) => void;
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
  const presetStatus = resolvePatchPresetStatus(props.patch);
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
      <InstrumentToolbar
        patch={props.patch}
        patches={props.patches}
        invalid={props.invalid}
        presetStatus={presetStatus}
        patchSource={patchSource}
        onRenamePatch={props.onRenamePatch}
        onSelectPatch={props.onSelectPatch}
        onDuplicatePatch={props.onDuplicatePatch}
        onDuplicatePatchToNewTab={props.onDuplicatePatchToNewTab}
        onUpdatePreset={props.onUpdatePreset}
        canRemovePatch={props.canRemovePatch}
        onRequestRemovePatch={props.onRequestRemovePatch}
      />

      {props.migrationNotice && <p className="warn">{props.migrationNotice}</p>}
      {props.invalid && (
        <p className="error">
          This instrument patch is invalid. Track playback may fail until you update the preset or fix the conflicting bindings.
        </p>
      )}

      <PatchEditorCanvas
        patch={props.patch}
        macroValues={props.macroValues}
        selectedNodeId={props.selectedNodeId}
        selectedMacroId={props.selectedMacroId}
        validationIssues={props.validationIssues}
        structureLocked={structureLocked}
        onSelectNode={props.onSelectNode}
        onSelectMacro={props.onSelectMacro}
        onClearSelectedMacro={props.onClearSelectedMacro}
        onApplyOp={props.onApplyOp}
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
