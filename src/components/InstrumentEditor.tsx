"use client";

import { PatchEditorCanvas } from "@/components/patch/PatchEditorCanvas";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface InstrumentEditorProps {
  patch: Patch;
  patches: Patch[];
  selectedNodeId?: string;
  validationIssues: PatchValidationIssue[];
  invalid?: boolean;
  previewPitch: string;
  migrationNotice?: string | null;
  onRenamePatch: (name: string) => void;
  onSelectPatch: (patchId: string) => void;
  onDuplicatePatch: () => void;
  onUpdatePreset: () => void;
  canRemovePatch: boolean;
  onRequestRemovePatch: () => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
  onSelectNode: (nodeId?: string) => void;
  onApplyOp: (op: PatchOp) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
}

interface InstrumentToolbarProps {
  patch: Patch;
  patches: Patch[];
  invalid?: boolean;
  presetStatus: ReturnType<typeof resolvePatchPresetStatus>;
  patchSource: ReturnType<typeof resolvePatchSource>;
  previewPitch: string;
  onRenamePatch: (name: string) => void;
  onSelectPatch: (patchId: string) => void;
  onDuplicatePatch: () => void;
  onUpdatePreset: () => void;
  canRemovePatch: boolean;
  onRequestRemovePatch: () => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
}

interface InstrumentToolbarActionsProps {
  invalid?: boolean;
  presetStatus: ReturnType<typeof resolvePatchPresetStatus>;
  onUpdatePreset: () => void;
  onDuplicatePatch: () => void;
  canRemovePatch: boolean;
  onRequestRemovePatch: () => void;
}

function InstrumentToolbarActions(props: InstrumentToolbarActionsProps) {
  return (
    <div className="instrument-toolbar-actions">
      {props.presetStatus === "preset_update_available" && (
        <button type="button" className={props.invalid ? "prominent-action" : undefined} onClick={props.onUpdatePreset}>
          Update Preset
        </button>
      )}
      <button type="button" onClick={props.onDuplicatePatch}>
        Duplicate Instrument Patch
      </button>
      <button type="button" disabled={!props.canRemovePatch} onClick={props.onRequestRemovePatch}>
        Remove Instrument
      </button>
    </div>
  );
}

function InstrumentToolbar(props: InstrumentToolbarProps) {
  const sourceLabel =
    props.presetStatus === "preset_update_available"
      ? "Preset update"
      : props.presetStatus === "legacy_preset"
        ? "Legacy preset"
        : props.patchSource;

  return (
    <div className="instrument-toolbar">
      <div className="instrument-toolbar-main">
        <div className="instrument-toolbar-heading">
          <select
            className="instrument-patch-select"
            aria-label="Select instrument"
            value={props.patch.id}
            onChange={(event) => props.onSelectPatch(event.target.value)}
          >
            {props.patches.map((patch) => (
              <option key={patch.id} value={patch.id}>
                {patch.name}
              </option>
            ))}
          </select>
        </div>
        <div className="instrument-identity">
          <input
            className="instrument-name-input"
            aria-label="Instrument name"
            value={props.patch.name}
            onChange={(event) => props.onRenamePatch(event.target.value)}
          />
          <span
            className={`instrument-source-badge ${
              props.presetStatus === "preset_update_available"
                ? "preset-update"
                : props.presetStatus === "legacy_preset"
                  ? "legacy-preset"
                  : props.patchSource
            }`}
          >
            {sourceLabel}
          </span>
          <code className="instrument-title-id">({props.patch.id})</code>
        </div>
      </div>

      <InstrumentToolbarActions
        invalid={props.invalid}
        presetStatus={props.presetStatus}
        onUpdatePreset={props.onUpdatePreset}
        onDuplicatePatch={props.onDuplicatePatch}
        canRemovePatch={props.canRemovePatch}
        onRequestRemovePatch={props.onRequestRemovePatch}
      />

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
  );
}

export function InstrumentEditor(props: InstrumentEditorProps) {
  const patchSource = resolvePatchSource(props.patch);
  const presetStatus = resolvePatchPresetStatus(props.patch);
  const structureLocked = patchSource === "preset";

  return (
    <section className={`instrument-editor${props.invalid ? " invalid" : ""}`}>
      <InstrumentToolbar
        patch={props.patch}
        patches={props.patches}
        invalid={props.invalid}
        presetStatus={presetStatus}
        patchSource={patchSource}
        previewPitch={props.previewPitch}
        onRenamePatch={props.onRenamePatch}
        onSelectPatch={props.onSelectPatch}
        onDuplicatePatch={props.onDuplicatePatch}
        onUpdatePreset={props.onUpdatePreset}
        canRemovePatch={props.canRemovePatch}
        onRequestRemovePatch={props.onRequestRemovePatch}
        onOpenPreviewPitchPicker={props.onOpenPreviewPitchPicker}
        onPreviewNow={props.onPreviewNow}
      />

      {props.migrationNotice && <p className="warn">{props.migrationNotice}</p>}
      {props.invalid && (
        <p className="error">
          This instrument patch is invalid. Track playback may fail until you update the preset or fix the conflicting bindings.
        </p>
      )}

      <PatchEditorCanvas
        patch={props.patch}
        selectedNodeId={props.selectedNodeId}
        validationIssues={props.validationIssues}
        structureLocked={structureLocked}
        onSelectNode={props.onSelectNode}
        onApplyOp={props.onApplyOp}
        onExposeMacro={props.onExposeMacro}
      />
    </section>
  );
}
