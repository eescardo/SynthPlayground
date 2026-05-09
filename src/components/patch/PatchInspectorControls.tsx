import { useLayoutEffect, useEffect, useRef, useState } from "react";
import {
  formatBindingSummary,
  formatBindingValue,
  resolveDiffHighlightClass
} from "@/components/patch/patchDiffPresentation";
import { PatchBindingDiff } from "@/lib/patch/diff";
import { createPatchMacroBindingKey } from "@/lib/patch/macroBindings";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { useRenameActivation } from "@/hooks/useRenameActivation";
import { clamp } from "@/lib/numeric";
import { MacroBinding, Patch, PatchMacro } from "@/types/patch";

function formatInlineBindingValues(binding: MacroBinding) {
  return formatBindingSummary(binding).replace(/^Macro /, "");
}

export function EditableNumberLabel(props: {
  id: string;
  value: number;
  min: number;
  max: number;
  className: string;
  inputClassName: string;
  displayScale?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const displayScale = props.displayScale ?? 1;
  const [draft, setDraft] = useState(formatBindingValue(props.value * displayScale));
  const renameActivation = useRenameActivation<string>();

  useEffect(() => {
    if (!editing) {
      setDraft(formatBindingValue(props.value * displayScale));
    }
  }, [displayScale, editing, props.value]);

  const commit = () => {
    const numeric = Number(draft);
    if (Number.isFinite(numeric)) {
      props.onCommit(clamp(numeric / displayScale, props.min, props.max));
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
            setDraft(formatBindingValue(props.value * displayScale));
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
      {formatBindingValue(props.value * displayScale)}
    </button>
  );
}

export function MacroBindingDetails(props: {
  patch: Patch;
  nodeId: string;
  paramId: string;
  boundMacroIds: string[];
  previewBindingById?: Map<string, MacroBinding>;
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
            const renderedBinding = props.previewBindingById?.get(binding.id) ?? binding;
            const bindingDiff = props.currentBindingDiffByKey.get(
              createPatchMacroBindingKey(props.patch, macro.id, binding)
            );
            const diffHighlightClass = resolveDiffHighlightClass(bindingDiff?.status);
            return (
              <div
                key={binding.id}
                className={`macro-binding-detail-card${diffHighlightClass ? ` diff-${diffHighlightClass}` : ""}`}
              >
                <div className="macro-binding-detail-mode">
                  {formatInlineBindingValues(renderedBinding)}
                  {bindingDiff && (
                    <span className="patch-diff-inline-badge">
                      {bindingDiff.status === "added" ? "New" : "Changed"}
                    </span>
                  )}
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
          {bindingDiff.baselineBinding && (
            <div className="macro-binding-range">{formatInlineBindingValues(bindingDiff.baselineBinding)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ParamMacroControl(props: {
  disabled?: boolean;
  bindingMacro?: PatchMacro;
  bindingMap?: MacroBinding["map"];
  showBindingMap?: boolean;
  macros: PatchMacro[];
  onBindNew: () => void;
  onBindExisting: (macroId: string) => void;
  onSetBindingMap: (map: "linear" | "exp") => void;
  onUnbind: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [bindPopoverPlacement, setBindPopoverPlacement] = useState<"below" | "above">("below");
  const unboundPopoverRef = useRef<HTMLSpanElement | null>(null);
  const bindPopoverRef = useRef<HTMLDivElement | null>(null);
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

  useLayoutEffect(() => {
    if (!open || !unboundPopoverRef.current || !bindPopoverRef.current) {
      return;
    }
    const triggerRect = unboundPopoverRef.current.getBoundingClientRect();
    const popoverRect = bindPopoverRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const margin = 12;
    const roomBelow = viewportHeight - triggerRect.bottom - margin;
    const roomAbove = triggerRect.top - margin;
    setBindPopoverPlacement(popoverRect.height > roomBelow && roomAbove > roomBelow ? "above" : "below");
  }, [open, props.macros.length]);

  if (props.bindingMacro) {
    const canChooseBindingMap =
      props.showBindingMap !== false &&
      (props.bindingMap === "linear" || props.bindingMap === "exp" || props.bindingMap === "piecewise");
    const selectedBindingMap = props.bindingMap === "exp" ? "exp" : "linear";
    return (
      <span className="param-macro-bound-shell" ref={boundPopoverRef}>
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
              <div
                className="patch-macro-keyframe-popover param-macro-map-popover"
                role="menu"
                aria-label="Macro binding interpolation"
              >
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
        <button
          type="button"
          className="param-macro-unbind-button"
          disabled={props.disabled}
          aria-label={`Use direct value instead of ${props.bindingMacro.name} macro binding`}
          onClick={props.onUnbind}
        >
          Direct
        </button>
      </span>
    );
  }

  return (
    <span className="param-macro-control" ref={unboundPopoverRef}>
      <button
        type="button"
        className="param-macro-button"
        disabled={props.disabled}
        onClick={() => setOpen((current) => !current)}
      >
        Bind
      </button>
      {open && (
        <div
          ref={bindPopoverRef}
          className={`param-macro-popover ${bindPopoverPlacement}`}
          role="dialog"
          aria-label="Bind parameter to macro"
        >
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
