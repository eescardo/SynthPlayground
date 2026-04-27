import { useEffect, useRef, useState } from "react";
import {
  formatBindingSummary,
  formatBindingValue,
  resolveDiffHighlightClass
} from "@/components/patch/patchDiffPresentation";
import { PatchBindingDiff } from "@/lib/patch/diff";
import { createMacroBindingKey } from "@/lib/patch/macroBindings";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { useRenameActivation } from "@/hooks/useRenameActivation";
import { clamp } from "@/lib/numeric";
import { MacroBinding, Patch, PatchMacro } from "@/types/patch";

export function EditableNumberLabel(props: {
  id: string;
  value: number;
  min: number;
  max: number;
  className: string;
  inputClassName: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatBindingValue(props.value));
  const renameActivation = useRenameActivation<string>();

  useEffect(() => {
    if (!editing) {
      setDraft(formatBindingValue(props.value));
    }
  }, [editing, props.value]);

  const commit = () => {
    const numeric = Number(draft);
    if (Number.isFinite(numeric)) {
      props.onCommit(clamp(numeric, props.min, props.max));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className={props.inputClassName}
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setEditing(false);
            setDraft(formatBindingValue(props.value));
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`${props.className}${renameActivation.isArmed(props.id) ? " rename-armed" : ""}`}
      disabled={props.disabled}
      {...renameActivation.getRenameTriggerProps({
        id: props.id,
        enabled: !props.disabled,
        onStartRename: () => setEditing(true)
      })}
    >
      {formatBindingValue(props.value)}
    </button>
  );
}

export function MacroBindingDetails(props: {
  patch: Patch;
  nodeId: string;
  paramId: string;
  boundMacroIds: string[];
  currentBindingDiffByKey: Map<string, PatchBindingDiff>;
  removedBindingDiffs: PatchBindingDiff[];
}) {
  const boundMacros = props.patch.ui.macros.filter((macro) => props.boundMacroIds.includes(macro.id));

  return (
    <div className="macro-binding-details">
      {boundMacros.map((macro) =>
        macro.bindings
          .filter((binding) => binding.nodeId === props.nodeId && binding.paramId === props.paramId)
          .map((binding) => {
            const bindingDiff = props.currentBindingDiffByKey.get(createMacroBindingKey(macro.id, binding));
            const diffHighlightClass = resolveDiffHighlightClass(bindingDiff?.status);
            return (
              <div
                key={binding.id}
                className={`macro-binding-detail-card${diffHighlightClass ? ` diff-${diffHighlightClass}` : ""}`}
              >
                <div className="macro-binding-detail-mode">
                  {formatBindingSummary(binding)}
                  {bindingDiff && <span className="patch-diff-inline-badge">{bindingDiff.status === "added" ? "New" : "Changed"}</span>}
                </div>
              </div>
            );
          })
      )}
      {props.removedBindingDiffs.map((bindingDiff) => (
        <div key={bindingDiff.key} className="macro-binding-detail-card diff-negative removed-diff-artifact">
          <div className="macro-binding-detail-mode">
            Removed <span className="patch-diff-inline-badge negative">{bindingDiff.macroName}</span>
          </div>
          {bindingDiff.baselineBinding && <div className="macro-binding-range">{formatBindingSummary(bindingDiff.baselineBinding)}</div>}
        </div>
      ))}
    </div>
  );
}

export function ParamMacroControl(props: {
  disabled?: boolean;
  editableSummary?: string | null;
  bindingMacro?: PatchMacro;
  bindingMap?: MacroBinding["map"];
  isEditing: boolean;
  macros: PatchMacro[];
  onBindNew: () => void;
  onBindExisting: (macroId: string) => void;
  onSetBindingMap: (map: "linear" | "exp") => void;
  onUnbind: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [tooltipPinned, setTooltipPinned] = useState(false);
  const unboundPopoverRef = useRef<HTMLSpanElement | null>(null);
  const boundPopoverRef = useRef<HTMLSpanElement | null>(null);

  useDismissiblePopover({
    active: open,
    popoverRef: unboundPopoverRef,
    onDismiss: () => setOpen(false)
  });
  useDismissiblePopover({
    active: mapOpen,
    popoverRef: boundPopoverRef,
    onDismiss: () => setMapOpen(false)
  });

  if (props.bindingMacro) {
    const canChooseBindingMap = props.bindingMap === "linear" || props.bindingMap === "exp" || props.bindingMap === "piecewise";
    const selectedBindingMap = props.bindingMap === "exp" ? "exp" : "linear";
    return (
      <span className="param-macro-bound-shell" ref={boundPopoverRef}>
        <button
          type="button"
          className={`param-macro-status${tooltipPinned ? " tooltip-pinned" : ""}`}
          onClick={() => setTooltipPinned((current) => !current)}
          onBlur={() => setTooltipPinned(false)}
          aria-expanded={tooltipPinned}
        >
          {props.bindingMacro.name}: {props.isEditing ? "editing" : "locked"}
          {props.editableSummary && <span className="param-macro-tooltip">{props.editableSummary}</span>}
        </button>
        {canChooseBindingMap && (
          <span className="patch-macro-keyframe-shell param-macro-map-shell">
            <button
              type="button"
              className="patch-macro-keyframe-pill param-macro-map-pill"
              disabled={props.disabled}
              aria-label={`Macro binding interpolation ${props.bindingMap === "exp" ? "exponential" : "linear"}`}
              aria-haspopup="menu"
              aria-expanded={mapOpen}
              onClick={() => setMapOpen((current) => !current)}
            >
              {selectedBindingMap === "exp" ? "EXP" : "LIN"}
            </button>
            {mapOpen && (
              <div className="patch-macro-keyframe-popover param-macro-map-popover" role="menu" aria-label="Macro binding interpolation">
                {(["linear", "exp"] as const).map((map) => (
                  <button
                    key={map}
                    type="button"
                    className={`patch-macro-keyframe-popover-option param-macro-map-popover-option${map === selectedBindingMap ? " active" : ""}`}
                    role="menuitemradio"
                    aria-checked={map === selectedBindingMap}
                    onClick={() => {
                      props.onSetBindingMap(map);
                      setMapOpen(false);
                    }}
                  >
                    {map === "exp" ? "EXP" : "LIN"}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
        <button type="button" className="patch-macro-panel-remove param-macro-unbind-button" disabled={props.disabled} aria-label={`Remove ${props.bindingMacro.name} macro binding`} onClick={props.onUnbind}>
          X
        </button>
      </span>
    );
  }

  return (
    <span className="param-macro-control" ref={unboundPopoverRef}>
      <button type="button" className="param-macro-button" disabled={props.disabled} onClick={() => setOpen((current) => !current)}>
        Macro...
      </button>
      {open && (
        <div className="param-macro-popover" role="dialog" aria-label="Bind parameter to macro">
          <button
            type="button"
            className="param-macro-popover-option new"
            onClick={() => {
              props.onBindNew();
              setOpen(false);
            }}
          >
            New
          </button>
          {props.macros.map((macro) => (
            <button
              key={macro.id}
              type="button"
              className="param-macro-popover-option"
              onClick={() => {
                props.onBindExisting(macro.id);
                setOpen(false);
              }}
            >
              {macro.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
