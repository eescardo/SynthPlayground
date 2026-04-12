"use client";

import { useEffect, useState } from "react";
import { PatchEditorCanvas } from "@/components/patch/PatchEditorCanvas";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface InstrumentEditorProps {
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

interface InstrumentToolbarProps {
  patch: Patch;
  patches: Patch[];
  invalid?: boolean;
  presetStatus: ReturnType<typeof resolvePatchPresetStatus>;
  patchSource: ReturnType<typeof resolvePatchSource>;
  onRenamePatch: (name: string) => void;
  onSelectPatch: (patchId: string) => void;
  onDuplicatePatch: () => void;
  onDuplicatePatchToNewTab: () => void;
  onUpdatePreset: () => void;
  canRemovePatch: boolean;
  onRequestRemovePatch: () => void;
}

interface InstrumentToolbarActionsProps {
  invalid?: boolean;
  presetStatus: ReturnType<typeof resolvePatchPresetStatus>;
  onUpdatePreset: () => void;
  onDuplicatePatch: () => void;
  onDuplicatePatchToNewTab: () => void;
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
        Duplicate
      </button>
      <button type="button" onClick={props.onDuplicatePatchToNewTab}>
        Duplicate to New Tab
      </button>
      <button type="button" disabled={!props.canRemovePatch} onClick={props.onRequestRemovePatch}>
        Remove
      </button>
    </div>
  );
}

function InstrumentToolbar(props: InstrumentToolbarProps) {
  const [nameDraft, setNameDraft] = useState(props.patch.name);
  const [nameEditing, setNameEditing] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const presetLineageLabel = props.patch.meta.source === "preset" ? props.patch.meta.presetId : props.patch.id;
  const sourceLabel =
    props.presetStatus === "preset_update_available"
      ? "Preset update"
      : props.presetStatus === "legacy_preset"
        ? "Legacy preset"
        : props.patchSource;

  useDismissiblePopover({
    active: selectorOpen,
    popoverSelector: ".instrument-patch-picker-shell",
    onDismiss: () => setSelectorOpen(false)
  });

  useEffect(() => {
    if (!nameEditing) {
      setNameDraft(props.patch.name);
    }
  }, [nameEditing, props.patch.name]);

  const commitRename = () => {
    const nextName = nameDraft.trim();
    if (nextName.length > 0 && nextName !== props.patch.name) {
      props.onRenamePatch(nextName);
    } else {
      setNameDraft(props.patch.name);
    }
    setNameEditing(false);
  };

  const startRename = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectorOpen(false);
    setNameEditing(true);
  };

  return (
    <div className="instrument-toolbar">
      <div className="instrument-patch-picker-shell">
        <div
          className="instrument-patch-picker"
          role="button"
          tabIndex={0}
          aria-label="Select instrument"
          aria-expanded={selectorOpen}
          onClick={() => setSelectorOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelectorOpen((open) => !open);
            }
          }}
        >
          <span className="instrument-patch-picker-label">
            {nameEditing ? (
              <input
                className="instrument-name-inline-input"
                aria-label="Instrument name"
                autoFocus
                value={nameDraft}
                onBlur={commitRename}
                onChange={(event) => setNameDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setNameDraft(props.patch.name);
                    setNameEditing(false);
                  }
                }}
              />
            ) : (
              <span
                className="instrument-patch-picker-name"
                role="button"
                tabIndex={0}
                onClick={startRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    startRename(event);
                  }
                }}
              >
                {props.patch.name}
              </span>
            )}
          </span>
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
          <span className="instrument-patch-picker-caret" aria-hidden="true">
            ▾
          </span>
        </div>

        {selectorOpen && (
          <div className="instrument-patch-picker-popover" role="dialog" aria-label="Select instrument">
            {props.patches.map((patch) => (
              <button
                key={patch.id}
                type="button"
                className={`instrument-patch-picker-option${patch.id === props.patch.id ? " active" : ""}`}
                onClick={() => {
                  props.onSelectPatch(patch.id);
                  setSelectorOpen(false);
                }}
              >
                <span>{patch.name}</span>
                {patch.id === props.patch.id && <span className="instrument-patch-picker-option-mark">Current</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="instrument-toolbar-lineage-label">({presetLineageLabel})</span>

      <InstrumentToolbarActions
        invalid={props.invalid}
        presetStatus={props.presetStatus}
        onUpdatePreset={props.onUpdatePreset}
        onDuplicatePatch={props.onDuplicatePatch}
        onDuplicatePatchToNewTab={props.onDuplicatePatchToNewTab}
        canRemovePatch={props.canRemovePatch}
        onRequestRemovePatch={props.onRequestRemovePatch}
      />
    </div>
  );
}

export function InstrumentEditor(props: InstrumentEditorProps) {
  const { invalid, macroValues, onReady, patch } = props;
  const patchSource = resolvePatchSource(props.patch);
  const presetStatus = resolvePatchPresetStatus(props.patch);
  const structureLocked = patchSource === "preset";

  useEffect(() => {
    if (!onReady) {
      return;
    }
    let cancelled = false;
    const frameId = window.requestAnimationFrame(() => {
      const nextFrameId = window.requestAnimationFrame(() => {
        if (!cancelled) {
          onReady(macroValues);
        }
      });
      if (cancelled) {
        window.cancelAnimationFrame(nextFrameId);
      }
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [macroValues, onReady, patch.id]);

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
