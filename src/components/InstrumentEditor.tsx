"use client";

import { MacroPanel } from "@/components/MacroPanel";
import { PatchEditorCanvas } from "@/components/PatchEditorCanvas";
import { resolvePatchSource } from "@/lib/patch/source";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface InstrumentEditorProps {
  patch: Patch;
  selectedNodeId?: string;
  validationIssues: PatchValidationIssue[];
  macroValues: Record<string, number>;
  previewPitch: string;
  onRenamePatch: (name: string) => void;
  onDuplicatePatch: () => void;
  onResetMacros: () => void;
  onRequestRemovePatch: () => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
  onSelectNode: (nodeId?: string) => void;
  onApplyOp: (op: PatchOp) => void;
  onMacroChange: (macroId: string, normalized: number) => void;
  onMacroCommit: (macroId: string, normalized: number) => void;
}

export function InstrumentEditor(props: InstrumentEditorProps) {
  const patchSource = resolvePatchSource(props.patch);
  const structureLocked = patchSource === "preset";

  return (
    <section className="instrument-editor">
      <div className="instrument-toolbar">
        <div className="instrument-toolbar-main">
          <div className="instrument-toolbar-heading">
            <h3>Instrument</h3>
            {patchSource === "preset" && <span className="instrument-source-badge preset">Preset</span>}
            <code className="instrument-title-id">({props.patch.id})</code>
          </div>
          <div className="instrument-identity">
            <input
              className="instrument-name-input"
              aria-label="Instrument name"
              value={props.patch.name}
              onChange={(event) => props.onRenamePatch(event.target.value)}
            />
          </div>
        </div>

        <div className="instrument-toolbar-actions">
          <button type="button" onClick={props.onDuplicatePatch}>
            Duplicate Instrument Patch
          </button>
          <button type="button" onClick={props.onResetMacros}>
            Reset Macro Values
          </button>
          <button type="button" disabled={structureLocked} onClick={props.onRequestRemovePatch}>
            Remove Instrument
          </button>
        </div>

        <div className="instrument-toolbar-separator" />

        <div className="instrument-preview">
          <span className="instrument-preview-label">Preview</span>
          <button type="button" className="preview-pitch-button" onClick={props.onOpenPreviewPitchPicker}>
            {props.previewPitch}
          </button>
          <button type="button" onClick={props.onPreviewNow}>
            Play
          </button>
        </div>
      </div>

      <MacroPanel
        patch={props.patch}
        macroValues={props.macroValues}
        onMacroChange={props.onMacroChange}
        onMacroCommit={props.onMacroCommit}
      />

      <PatchEditorCanvas
        patch={props.patch}
        selectedNodeId={props.selectedNodeId}
        validationIssues={props.validationIssues}
        structureLocked={structureLocked}
        onSelectNode={props.onSelectNode}
        onApplyOp={props.onApplyOp}
      />
    </section>
  );
}
