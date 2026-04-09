"use client";

import { useEffect } from "react";
import { SelectionExplodeMode, SelectionExplodeScope } from "@/hooks/useSelectionClipboardActions";

interface ExplodeSelectionDialogProps {
  countText: string;
  mode: SelectionExplodeMode;
  open: boolean;
  scope: SelectionExplodeScope;
  selectionKind: "note" | "timeline";
  onClose: () => void;
  onConfirm: () => void;
  onCountTextChange: (value: string) => void;
  onModeChange: (mode: SelectionExplodeMode) => void;
  onScopeChange: (scope: SelectionExplodeScope) => void;
}

const BLOCKED_NUMBER_KEYS = new Set(["e", "E", "+", "-", ".", ","]);

export function ExplodeSelectionDialog({
  countText,
  mode,
  open,
  scope,
  selectionKind,
  onClose,
  onConfirm,
  onCountTextChange,
  onModeChange,
  onScopeChange
}: ExplodeSelectionDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" aria-label="Explode options" onClick={onClose}>
      <div className="help-modal explode-selection-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Explode Options</h3>
        <div className="explode-selection-form">
          <label className="explode-selection-field">
            Iterations
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={countText}
              onBeforeInput={(event) => {
                if (event.data && /\D/.test(event.data)) {
                  event.preventDefault();
                }
              }}
              onKeyDown={(event) => {
                if (BLOCKED_NUMBER_KEYS.has(event.key)) {
                  event.preventDefault();
                }
              }}
              onChange={(event) => onCountTextChange(event.target.value.replace(/\D+/g, ""))}
            />
          </label>

          <fieldset className="explode-selection-fieldset">
            <legend>Scope</legend>
            <label className="explode-selection-choice">
              <input
                type="radio"
                name="explode-scope"
                value="selected-tracks"
                checked={scope === "selected-tracks"}
                disabled={selectionKind === "timeline"}
                onChange={() => onScopeChange("selected-tracks")}
              />
              Selected Track(s)
            </label>
            <label className="explode-selection-choice">
              <input
                type="radio"
                name="explode-scope"
                value="all-tracks"
                checked={scope === "all-tracks"}
                onChange={() => onScopeChange("all-tracks")}
              />
              All Tracks
            </label>
          </fieldset>

          <fieldset className="explode-selection-fieldset">
            <legend>Mode</legend>
            <label className="explode-selection-choice">
              <input
                type="radio"
                name="explode-mode"
                value="insert"
                checked={mode === "insert"}
                onChange={() => onModeChange("insert")}
              />
              Insert
            </label>
            <label className="explode-selection-choice">
              <input
                type="radio"
                name="explode-mode"
                value="replace"
                checked={mode === "replace"}
                onChange={() => onModeChange("replace")}
              />
              Replace
            </label>
          </fieldset>
        </div>
        <div className="pitch-picker-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={!/^[1-9]\d*$/.test(countText)}>
            Explode
          </button>
        </div>
      </div>
    </div>
  );
}
