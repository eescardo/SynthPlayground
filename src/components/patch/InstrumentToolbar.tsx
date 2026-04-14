"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useState } from "react";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { useInlineRename } from "@/hooks/useInlineRename";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { Patch } from "@/types/patch";

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

export function InstrumentToolbar(props: InstrumentToolbarProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const presetLineageLabel = props.patch.meta.source === "preset" ? props.patch.meta.presetId : props.patch.id;
  const sourceLabel =
    props.presetStatus === "preset_update_available"
      ? "Preset update"
      : props.presetStatus === "legacy_preset"
        ? "Legacy preset"
        : props.patchSource;
  const rename = useInlineRename({
    value: props.patch.name,
    onCommit: props.onRenamePatch
  });

  useDismissiblePopover({
    active: selectorOpen,
    popoverSelector: ".instrument-patch-picker-shell",
    onDismiss: () => setSelectorOpen(false)
  });

  const startRename = (event: ReactMouseEvent | ReactKeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
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
