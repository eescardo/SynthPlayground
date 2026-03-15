"use client";

import { PatchEditorCanvas } from "@/components/PatchEditorCanvas";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface InstrumentEditorProps {
  patch: Patch;
  selectedNodeId?: string;
  validationIssues: PatchValidationIssue[];
  previewPitch: string;
  onRenamePatch: (name: string) => void;
  onDuplicatePatch: () => void;
  onRequestRemovePatch: () => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
  onSelectNode: (nodeId?: string) => void;
  onApplyOp: (op: PatchOp) => void;
}

export function InstrumentEditor(props: InstrumentEditorProps) {
  const patchSource = resolvePatchSource(props.patch);
  const presetStatus = resolvePatchPresetStatus(props.patch);
  const structureLocked = patchSource === "preset";

  return (
    <section className="instrument-editor">
      <div className="instrument-toolbar">
        <div className="instrument-toolbar-main">
          <div className="instrument-toolbar-heading">
            <h3>Instrument</h3>
            {presetStatus === "preset" && <span className="instrument-source-badge preset">Preset</span>}
            {presetStatus === "preset_update_available" && (
              <span className="instrument-source-badge preset-update">Preset Update Available</span>
            )}
            {presetStatus === "legacy_preset" && (
              <span className="instrument-source-badge legacy-preset">Legacy Preset</span>
            )}
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
