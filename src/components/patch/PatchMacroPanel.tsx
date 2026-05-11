"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { getMacroKeyframePositions, snapNormalizedToMacroKeyframe } from "@/lib/patch/macroKeyframes";
import { resolveDiffHighlightClass } from "@/components/patch/patchDiffPresentation";
import { PatchMacroPanelActions, PatchMacroPanelModel } from "@/components/patch/patchEditorSession";
import { PatchValidationIssue } from "@/types/patch";

interface PatchMacroPanelProps {
  model: PatchMacroPanelModel;
  actions: PatchMacroPanelActions;
}

export function PatchMacroPanel(props: PatchMacroPanelProps) {
  const { actions, model } = props;
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [editingMacroName, setEditingMacroName] = useState("");
  const [keyframeMenuMacroId, setKeyframeMenuMacroId] = useState<string | null>(null);
  const pendingCommitMacroIdRef = useRef<string | null>(null);
  const keyframeMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editingMacroId) {
      return;
    }
    const activeMacro = model.patch.ui.macros.find((macro) => macro.id === editingMacroId);
    if (!activeMacro) {
      setEditingMacroId(null);
      setEditingMacroName("");
      return;
    }
    setEditingMacroName(activeMacro.name);
  }, [editingMacroId, model.patch.ui.macros]);

  useEffect(() => {
    if (!keyframeMenuMacroId) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!keyframeMenuRef.current?.contains(event.target as Node)) {
        setKeyframeMenuMacroId(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setKeyframeMenuMacroId(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [keyframeMenuMacroId]);

  useEffect(() => {
    if (keyframeMenuMacroId && !model.patch.ui.macros.some((macro) => macro.id === keyframeMenuMacroId)) {
      setKeyframeMenuMacroId(null);
    }
  }, [keyframeMenuMacroId, model.patch.ui.macros]);

  const commitMacroName = (macroId: string) => {
    const nextName = editingMacroName.trim();
    if (nextName) {
      actions.onRenameMacro(macroId, nextName);
    }
    setEditingMacroId(null);
    setEditingMacroName("");
  };

  const commitMacroValueIfPending = (macroId: string, normalized: number) => {
    if (pendingCommitMacroIdRef.current !== macroId) {
      return;
    }
    pendingCommitMacroIdRef.current = null;
    actions.onChangeMacroValue(macroId, normalized, { commit: true });
  };

  const brokenBindingIssuesByMacroId = new Map<string, PatchValidationIssue[]>();
  for (const issue of model.validationIssues) {
    if (issue.code !== "macro-binding-missing-node" && issue.code !== "macro-binding-invalid-param") {
      continue;
    }
    const macroId = issue.context?.macroId;
    if (!macroId) {
      continue;
    }
    brokenBindingIssuesByMacroId.set(macroId, [...(brokenBindingIssuesByMacroId.get(macroId) ?? []), issue]);
  }

  return (
    <section className="patch-macro-panel" aria-label="Patch macros">
      <div className="patch-macro-panel-header">
        <div className="patch-macro-panel-tab">Macros</div>
        <button
          type="button"
          className="patch-macro-panel-clear"
          disabled={!model.selectedMacroId}
          onClick={actions.onClearSelection}
        >
          Clear
        </button>
        <button
          type="button"
          className="patch-macro-panel-add"
          aria-label="Add macro"
          title={model.structureLocked ? "Preset macros cannot be added" : "Add macro"}
          disabled={model.structureLocked}
          onClick={actions.onAddMacro}
        >
          +
        </button>
      </div>

      <div className="patch-macro-panel-body">
        {model.patch.ui.macros.length === 0 ? (
          <p className="patch-macro-panel-empty">No macros yet.</p>
        ) : (
          model.patch.ui.macros.map((macro) => {
            const value = model.macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5;
            const isEditing = editingMacroId === macro.id;
            const isSelected = model.selectedMacroId === macro.id;
            const keyframePositions = getMacroKeyframePositions(macro.keyframeCount);
            const diffHighlightClass = resolveDiffHighlightClass(model.patchDiff.macroDiffById.get(macro.id)?.status);
            const brokenBindingIssues = brokenBindingIssuesByMacroId.get(macro.id) ?? [];
            return (
              <div
                key={macro.id}
                className={`patch-macro-row${isSelected ? " selected" : ""}${diffHighlightClass ? ` diff-${diffHighlightClass}` : ""}${brokenBindingIssues.length > 0 ? " invalid" : ""}`}
                onPointerDown={() => actions.onSelectMacro(macro.id)}
              >
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
                    disabled={model.structureLocked}
                    onClick={() => {
                      if (model.structureLocked) {
                        return;
                      }
                      setEditingMacroId(macro.id);
                      setEditingMacroName(macro.name);
                    }}
                  >
                    {macro.name}
                  </button>
                )}

                <div className="patch-macro-slider-shell">
                  <div className="patch-macro-slider-keyframes" aria-hidden="true">
                    {keyframePositions.map((position, index) => (
                      <span
                        key={`${macro.id}_keyframe_${index}`}
                        className="patch-macro-slider-keyframe-notch"
                        style={
                          {
                            "--macro-keyframe-position": `${position * 100}%`
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <input
                    className="patch-macro-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={value}
                    aria-label={`${macro.name} macro amount`}
                    style={
                      {
                        "--macro-slider-percent": `${Math.round(value * 100)}%`
                      } as CSSProperties
                    }
                    onChange={(event) => {
                      pendingCommitMacroIdRef.current = macro.id;
                      actions.onSelectMacro(macro.id);
                      actions.onChangeMacroValue(
                        macro.id,
                        snapNormalizedToMacroKeyframe(macro.keyframeCount, Number(event.target.value))
                      );
                    }}
                    onPointerUp={(event) =>
                      commitMacroValueIfPending(
                        macro.id,
                        snapNormalizedToMacroKeyframe(macro.keyframeCount, Number(event.currentTarget.value))
                      )
                    }
                    onBlur={(event) =>
                      commitMacroValueIfPending(
                        macro.id,
                        snapNormalizedToMacroKeyframe(macro.keyframeCount, Number(event.currentTarget.value))
                      )
                    }
                    onKeyUp={(event) => {
                      if (
                        [
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                          "Home",
                          "End",
                          "PageUp",
                          "PageDown"
                        ].includes(event.key)
                      ) {
                        commitMacroValueIfPending(
                          macro.id,
                          snapNormalizedToMacroKeyframe(macro.keyframeCount, Number(event.currentTarget.value))
                        );
                      }
                    }}
                  />
                </div>

                <div
                  ref={keyframeMenuMacroId === macro.id ? keyframeMenuRef : null}
                  className="patch-macro-keyframe-shell"
                >
                  <button
                    type="button"
                    className="patch-macro-keyframe-pill"
                    aria-label={`${macro.keyframeCount} keyframes`}
                    aria-haspopup="menu"
                    aria-expanded={keyframeMenuMacroId === macro.id}
                    title={model.structureLocked ? "Preset macro keyframes cannot be changed" : "Set macro keyframes"}
                    disabled={model.structureLocked}
                    onClick={() => {
                      actions.onSelectMacro(macro.id);
                      setKeyframeMenuMacroId((current) => (current === macro.id ? null : macro.id));
                    }}
                  >
                    {macro.keyframeCount}
                  </button>

                  {keyframeMenuMacroId === macro.id && (
                    <div
                      className="patch-macro-keyframe-popover"
                      role="menu"
                      aria-label={`Keyframes for ${macro.name}`}
                    >
                      {[2, 3].map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={`patch-macro-keyframe-popover-option${count === macro.keyframeCount ? " active" : ""}`}
                          role="menuitemradio"
                          aria-checked={count === macro.keyframeCount}
                          onClick={() => {
                            actions.onSetMacroKeyframeCount(macro.id, count);
                            setKeyframeMenuMacroId(null);
                          }}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {brokenBindingIssues.length > 0 && (
                  <span
                    className="patch-macro-binding-warning"
                    title={brokenBindingIssues.map((issue) => issue.message).join("\n")}
                    aria-label={`${macro.name} has ${brokenBindingIssues.length} broken macro binding${brokenBindingIssues.length === 1 ? "" : "s"}`}
                  >
                    !
                  </span>
                )}

                <button
                  type="button"
                  className="patch-macro-panel-remove"
                  aria-label={`Remove macro ${macro.name}`}
                  title={model.structureLocked ? "Preset macros cannot be removed" : `Remove macro ${macro.name}`}
                  disabled={model.structureLocked}
                  onClick={() => actions.onRemoveMacro(macro.id)}
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
