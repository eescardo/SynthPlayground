"use client";

import { useEffect, useRef, useState } from "react";
import { Patch } from "@/types/patch";

interface PatchMacroPanelProps {
  patch: Patch;
  structureLocked?: boolean;
  onAddMacro: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export function PatchMacroPanel(props: PatchMacroPanelProps) {
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [editingMacroName, setEditingMacroName] = useState("");
  const pendingCommitMacroIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingMacroId) {
      return;
    }
    const activeMacro = props.patch.ui.macros.find((macro) => macro.id === editingMacroId);
    if (!activeMacro) {
      setEditingMacroId(null);
      setEditingMacroName("");
      return;
    }
    setEditingMacroName(activeMacro.name);
  }, [editingMacroId, props.patch.ui.macros]);

  const commitMacroName = (macroId: string) => {
    const nextName = editingMacroName.trim();
    if (nextName) {
      props.onRenameMacro(macroId, nextName);
    }
    setEditingMacroId(null);
    setEditingMacroName("");
  };

  const commitMacroValueIfPending = (macroId: string, normalized: number) => {
    if (pendingCommitMacroIdRef.current !== macroId) {
      return;
    }
    pendingCommitMacroIdRef.current = null;
    props.onChangeMacroValue(macroId, normalized, { commit: true });
  };

  return (
    <section className="patch-macro-panel" aria-label="Patch macros">
      <div className="patch-macro-panel-header">
        <div className="patch-macro-panel-tab">Macros</div>
        <button
          type="button"
          className="patch-macro-panel-add"
          aria-label="Add macro"
          title={props.structureLocked ? "Preset macros cannot be added" : "Add macro"}
          disabled={props.structureLocked}
          onClick={props.onAddMacro}
        >
          +
        </button>
      </div>

      <div className="patch-macro-panel-body">
        {props.patch.ui.macros.length === 0 ? (
          <p className="patch-macro-panel-empty">No macros yet.</p>
        ) : (
          props.patch.ui.macros.map((macro) => {
            const value = macro.defaultNormalized ?? 0.5;
            const isEditing = editingMacroId === macro.id;
            return (
              <div key={macro.id} className="patch-macro-row">
                {isEditing ? (
                  <input
                    className="patch-macro-name-input"
                    value={editingMacroName}
                    autoFocus
                    aria-label={`Rename macro ${macro.name}`}
                    onChange={(event) => setEditingMacroName(event.target.value)}
                    onBlur={() => commitMacroName(macro.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      } else if (event.key === "Escape") {
                        setEditingMacroId(null);
                        setEditingMacroName("");
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="patch-macro-name-button"
                    disabled={props.structureLocked}
                    onClick={() => {
                      if (props.structureLocked) {
                        return;
                      }
                      setEditingMacroId(macro.id);
                      setEditingMacroName(macro.name);
                    }}
                  >
                    {macro.name}
                  </button>
                )}

                <input
                  className="patch-macro-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={value}
                  aria-label={`${macro.name} macro amount`}
                  onChange={(event) => {
                    pendingCommitMacroIdRef.current = macro.id;
                    props.onChangeMacroValue(macro.id, Number(event.target.value));
                  }}
                  onPointerUp={(event) => commitMacroValueIfPending(macro.id, Number(event.currentTarget.value))}
                  onBlur={(event) => commitMacroValueIfPending(macro.id, Number(event.currentTarget.value))}
                  onKeyUp={(event) => {
                    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                      commitMacroValueIfPending(macro.id, Number(event.currentTarget.value));
                    }
                  }}
                />

                <button
                  type="button"
                  className="patch-macro-panel-remove"
                  aria-label={`Remove macro ${macro.name}`}
                  title={props.structureLocked ? "Preset macros cannot be removed" : `Remove macro ${macro.name}`}
                  disabled={props.structureLocked}
                  onClick={() => props.onRemoveMacro(macro.id)}
                >
                  -
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
