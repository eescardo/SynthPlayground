"use client";

import { useRef, useState } from "react";
import { usePatchWorkspaceInstrument } from "@/components/patch/PatchWorkspaceContext";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { useInlineRename } from "@/hooks/useInlineRename";
import { useRenameActivation } from "@/hooks/useRenameActivation";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { Patch } from "@/types/patch";

interface InstrumentToolbarProps {
  patch: Patch;
  invalid?: boolean;
}

interface InstrumentToolbarActionsProps {
  invalid?: boolean;
  presetStatus: ReturnType<typeof resolvePatchPresetStatus>;
}

function InstrumentToolbarActions(props: InstrumentToolbarActionsProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const instrument = usePatchWorkspaceInstrument();

  return (
    <div className="instrument-toolbar-actions">
      {props.presetStatus === "preset_update_available" && (
        <button type="button" className={props.invalid ? "prominent-action" : undefined} onClick={instrument.updatePreset}>
          Update Preset
        </button>
      )}
      <button type="button" onClick={instrument.duplicatePatch}>
        Duplicate
      </button>
      <button type="button" onClick={instrument.duplicatePatchToNewTab}>
        Duplicate to New Tab
      </button>
      <button type="button" onClick={instrument.exportPatchJson}>
        Export JSON
      </button>
      <button type="button" onClick={() => importInputRef.current?.click()}>
        Import JSON
      </button>
      <button type="button" disabled={!instrument.canRemovePatch} onClick={instrument.requestRemovePatch}>
        Remove
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            instrument.importPatchFile(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

export function InstrumentToolbar(props: InstrumentToolbarProps) {
  const instrument = usePatchWorkspaceInstrument();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const renameActivation = useRenameActivation<"instrument-name">();
  const presetLineageLabel = props.patch.meta.source === "preset" ? props.patch.meta.presetId : props.patch.id;
  const presetStatus = resolvePatchPresetStatus(props.patch);
  const patchSource = resolvePatchSource(props.patch);
  const sourceLabel =
    presetStatus === "preset_update_available"
      ? "Preset update"
      : presetStatus === "legacy_preset"
        ? "Legacy preset"
        : patchSource;
  const rename = useInlineRename({
    value: props.patch.name,
    onCommit: instrument.renamePatch
  });

  useDismissiblePopover({
    active: selectorOpen,
    popoverSelector: ".instrument-patch-picker-shell",
    onDismiss: () => setSelectorOpen(false)
  });

  const startRename = () => {
    setSelectorOpen(false);
    rename.setEditing(true);
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
            if (event.target !== event.currentTarget) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelectorOpen((open) => !open);
            }
          }}
        >
          <span className="instrument-patch-picker-label">
            {rename.editing ? (
              <input
                className="instrument-name-inline-input"
                aria-label="Instrument name"
                autoFocus
                value={rename.draft}
                onBlur={rename.commit}
                onChange={(event) => rename.setDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    rename.commit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    rename.cancel();
                  }
                  event.stopPropagation();
                }}
              />
            ) : (
              <span
                className={`instrument-patch-picker-name${renameActivation.isArmed("instrument-name") ? " rename-armed" : ""}`}
                role="button"
                tabIndex={0}
                {...renameActivation.getRenameTriggerProps({
                  id: "instrument-name",
                  onStartRename: startRename
                })}
              >
                {props.patch.name}
              </span>
            )}
          </span>
          <span
            className={`instrument-source-badge ${
              presetStatus === "preset_update_available"
                ? "preset-update"
                : presetStatus === "legacy_preset"
                  ? "legacy-preset"
                  : patchSource
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
            {instrument.patches.map((patch) => (
              <button
                key={patch.id}
                type="button"
                className={`instrument-patch-picker-option${patch.id === props.patch.id ? " active" : ""}`}
                onClick={() => {
                  instrument.selectPatch(patch.id);
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

      <InstrumentToolbarActions invalid={props.invalid} presetStatus={presetStatus} />
    </div>
  );
}
