import { useEffect, useState } from "react";
import {
  getMacroKeyframePositions,
  resolveMacroBindingValue,
  resolveMacroKeyframeIndexAtValue
} from "@/lib/patch/macroKeyframes";
import { PatchBindingDiff, PatchDiff, PatchDiffStatus } from "@/lib/patch/diff";
import { SamplePlayerInspectorSection } from "@/components/patch/SamplePlayerInspectorSection";
import { ProbeInspectorSection } from "@/components/patch/ProbeInspectorSection";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { useRenameActivation } from "@/hooks/useRenameActivation";
import { createId } from "@/lib/ids";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { MacroBinding, Patch, PatchMacro, PatchNode, PatchParamSliderRange, ParamSchema, ParamValue, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";
import { samplePlayerPitchSemisToRootPitch } from "@/lib/patch/samplePlayer";

function formatBindingValue(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}

function resolveDiffTone(status: PatchDiffStatus | undefined): "positive" | "negative" | null {
  if (status === "added" || status === "modified") {
    return "positive";
  }
  if (status === "removed") {
    return "negative";
  }
  return null;
}

function connectionLabel(connection: Pick<Patch["connections"][number], "from" | "to">) {
  return `${connection.from.nodeId}.${connection.from.portId} -> ${connection.to.nodeId}.${connection.to.portId}`;
}

function clampNumericValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getParamNumericRange(param: ParamSchema) {
  return param.type === "float" ? param.range : { min: 0, max: 1 };
}

function buildParamRangeKey(nodeId: string, paramId: string) {
  return `${nodeId}:${paramId}`;
}

function resolveParamSliderRange(patch: Patch, nodeId: string, param: ParamSchema): PatchParamSliderRange {
  const schemaRange = getParamNumericRange(param);
  const storedRange = patch.ui.paramRanges?.[buildParamRangeKey(nodeId, param.id)];
  if (!storedRange || param.type !== "float") {
    return schemaRange;
  }
  const min = clampNumericValue(storedRange.min, param.range.min, param.range.max);
  const max = clampNumericValue(storedRange.max, param.range.min, param.range.max);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function formatBindingSummary(binding: MacroBinding) {
  if (binding.map === "piecewise" && binding.points && binding.points.length >= 2) {
    return `Keyframed ${binding.points.map((point) => formatBindingValue(point.y)).join(" - ")}`;
  }
  return `Range ${formatBindingValue(binding.min ?? 0)} - ${formatBindingValue(binding.max ?? 1)}`;
}

function createDefaultBindingForParam(
  param: ParamSchema,
  macro: PatchMacro,
  range = getParamNumericRange(param)
): Pick<MacroBinding, "map" | "min" | "max" | "points"> {
  if (macro.keyframeCount > 2) {
    return {
      map: "piecewise",
      points: getMacroKeyframePositions(macro.keyframeCount).map((x) => ({
        x,
        y: range.min + (range.max - range.min) * x
      }))
    };
  }
  return {
    map: "linear",
    min: range.min,
    max: range.max
  };
}

function EditableExtremeLabel(props: {
  id: string;
  value: number;
  min: number;
  max: number;
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
      props.onCommit(clampNumericValue(numeric, props.min, props.max));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="param-range-label-input"
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
      className={`param-range-label${renameActivation.isArmed(props.id) ? " rename-armed" : ""}`}
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

function EditableParamValueLabel(props: {
  id: string;
  value: number;
  min: number;
  max: number;
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
      props.onCommit(clampNumericValue(numeric, props.min, props.max));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="param-current-value-input"
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
      className={`param-current-value-label${renameActivation.isArmed(props.id) ? " rename-armed" : ""}`}
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

function MacroBindingDetails(props: {
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
              const bindingDiff = props.currentBindingDiffByKey.get(`${macro.id}:${binding.id}`);
              const diffTone = resolveDiffTone(bindingDiff?.status);
              return (
              <div
                key={binding.id}
                className={`macro-binding-detail-card${diffTone ? ` diff-${diffTone}` : ""}`}
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

function ParamValueControl(props: {
  param: ParamSchema;
  value: ParamValue;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: ParamValue) => void;
}) {
  const { param, value, disabled, onChange } = props;

  if (param.type === "float") {
    return <FloatParamValueControl param={param} value={Number(value)} min={props.min} max={props.max} disabled={disabled} onChange={onChange} />;
  }

  if (param.type === "enum") {
    return (
      <select value={String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {param.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />;
}

function FloatParamValueControl(props: {
  param: Extract<ParamSchema, { type: "float" }>;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(props.value);

  useEffect(() => {
    setDraftValue(props.value);
  }, [props.value]);

  const commitDraft = (nextValue: number) => {
    if (nextValue === props.value) {
      return;
    }
    props.onChange(nextValue);
  };

  return (
    <input
      className="param-value-slider"
      type="range"
      min={props.min ?? props.param.range.min}
      max={props.max ?? props.param.range.max}
      step={props.param.step ?? ((props.max ?? props.param.range.max) - (props.min ?? props.param.range.min)) / 500}
      value={draftValue}
      disabled={props.disabled}
      onChange={(event) => setDraftValue(Number(event.target.value))}
      onPointerUp={(event) => commitDraft(Number(event.currentTarget.value))}
      onBlur={(event) => commitDraft(Number(event.currentTarget.value))}
      onKeyUp={(event) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
          commitDraft(Number(event.currentTarget.value));
        }
      }}
    />
  );
}

function renderParamInlineSummary(node: PatchNode, param: ParamSchema, value: ParamValue) {
  if (node.typeId === "SamplePlayer" && param.id === "pitchSemis" && typeof value === "number") {
    return <div className="sample-player-pitch-readout">Treat as {samplePlayerPitchSemisToRootPitch(value)}</div>;
  }
  return null;
}

function shouldRenderParamInGenericInspector(node: PatchNode, param: ParamSchema) {
  if (node.typeId === "SamplePlayer" && (param.id === "start" || param.id === "end")) {
    return false;
  }
  return true;
}

function ParamMacroControl(props: {
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
  useDismissiblePopover({
    active: open,
    popoverSelector: ".param-macro-control",
    onDismiss: () => setOpen(false)
  });
  useDismissiblePopover({
    active: mapOpen,
    popoverSelector: ".param-macro-bound-shell",
    onDismiss: () => setMapOpen(false)
  });

  if (props.bindingMacro) {
    const canChooseBindingMap = props.bindingMap === "linear" || props.bindingMap === "exp";
    return (
      <span className="param-macro-bound-shell">
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
              {props.bindingMap === "exp" ? "EXP" : "LIN"}
            </button>
            {mapOpen && (
              <div className="patch-macro-keyframe-popover param-macro-map-popover" role="menu" aria-label="Macro binding interpolation">
                {(["linear", "exp"] as const).map((map) => (
                  <button
                    key={map}
                    type="button"
                    className={`patch-macro-keyframe-popover-option param-macro-map-popover-option${map === props.bindingMap ? " active" : ""}`}
                    role="menuitemradio"
                    aria-checked={map === props.bindingMap}
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
    <span className="param-macro-control">
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

function commitParamValueChange(props: {
  patchProps: PatchInspectorProps;
  selectedNode: PatchNode;
  param: ParamSchema;
  bindingState: ReturnType<typeof resolveParamBindingState>;
  selectedMacroValue: number | undefined;
  value: ParamValue;
}) {
  if (props.patchProps.structureLocked) {
    return;
  }
  if (props.bindingState.isEditableSelectedMacroBinding && props.bindingState.activeBindingMacro && typeof props.value === "number") {
    props.patchProps.onApplyOp({
      type: "setMacroBindingKeyframeValue",
      macroId: props.bindingState.activeBindingMacro.id,
      nodeId: props.selectedNode.id,
      paramId: props.param.id,
      normalized: props.selectedMacroValue ?? 0,
      value: props.value
    });
    return;
  }
  if (!props.bindingState.isExposed) {
    props.patchProps.onApplyOp({
      type: "setParam",
      nodeId: props.selectedNode.id,
      paramId: props.param.id,
      value: props.value
    });
  }
}

interface PatchInspectorProps {
  patch: Patch;
  patchDiff: PatchDiff;
  macroValues: Record<string, number>;
  selectedNode?: PatchNode;
  selectedProbe?: PatchWorkspaceProbeState;
  selectedMacroId?: string;
  selectedSchema?: NonNullable<ReturnType<typeof getModuleSchema>>;
  previewCapture?: PreviewProbeCapture;
  previewProgress: number;
  attachingProbeId?: string | null;
  structureLocked?: boolean;
  validationIssues: PatchValidationIssue[];
  onApplyOp: (op: PatchOp) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onUpdateProbeSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onUpdateProbeFrequencyView: (probeId: string, maxHz: number) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onClearProbeTarget: (probeId: string) => void;
}

function resolveIssuesForNode(nodeId: string, issues: PatchValidationIssue[]) {
  return issues.filter((issue) => {
    const context = issue.context;
    if (!context) {
      return false;
    }
    return (
      context.nodeId === nodeId ||
      context.conflictingMacroId === nodeId ||
      context.atNode === nodeId ||
      context.targetPort?.startsWith(`${nodeId}:`) === true ||
      context.path?.split(" -> ").includes(nodeId) === true
    );
  });
}

function resolveRequiredPortIssues(issues: PatchValidationIssue[]) {
  return issues.filter((issue) => issue.code === "required-port-unconnected");
}

function resolveParamBindingState(
  patch: Patch,
  selectedNode: PatchNode,
  param: ParamSchema,
  selectedMacroId: string | undefined,
  selectedMacroKeyframeIndex: number | null,
  structureLocked: boolean | undefined
) {
  const boundMacros = patch.ui.macros.filter((macro) =>
    macro.bindings.some((binding) => binding.nodeId === selectedNode.id && binding.paramId === param.id)
  );
  const activeBindingMacro = boundMacros[0];
  const isExposed = boundMacros.length > 0;
  const isEditableSelectedMacroBinding =
    Boolean(activeBindingMacro) &&
    !structureLocked &&
    selectedMacroId === activeBindingMacro?.id &&
    selectedMacroKeyframeIndex !== null &&
    param.type === "float";
  const editableSummary =
    activeBindingMacro && selectedMacroId === activeBindingMacro.id
      ? selectedMacroKeyframeIndex !== null
        ? `Editing ${activeBindingMacro.name} at keyframe ${selectedMacroKeyframeIndex + 1}/${activeBindingMacro.keyframeCount}`
        : "Bound values unlock when the selected macro is parked on a keyframe notch."
      : activeBindingMacro
        ? `Select ${activeBindingMacro.name} and stop on a keyframe notch to edit this binding.`
        : null;

  return {
    activeBindingMacro,
    boundMacros,
    editableSummary,
    isEditableSelectedMacroBinding,
    isExposed
  };
}

export function PatchInspector(props: PatchInspectorProps) {
  const selectedNode = props.selectedNode;
  const selectedProbe = props.selectedProbe;
  const selectedMacro = props.selectedMacroId
    ? props.patch.ui.macros.find((macro) => macro.id === props.selectedMacroId)
    : undefined;
  const selectedMacroValue =
    selectedMacro ? (props.macroValues[selectedMacro.id] ?? selectedMacro.defaultNormalized ?? 0.5) : undefined;
  const selectedMacroKeyframeIndex =
    selectedMacro && typeof selectedMacroValue === "number"
      ? resolveMacroKeyframeIndexAtValue(selectedMacro.keyframeCount, selectedMacroValue)
      : null;

  const exposeMacro = (paramId: string, suggestedName: string) => {
    if (!selectedNode || props.structureLocked) {
      return;
    }
    props.onExposeMacro(selectedNode.id, paramId, suggestedName);
  };

  const bindParamToMacro = (param: ParamSchema, macroId: string) => {
    if (!selectedNode || props.structureLocked) {
      return;
    }
    const macro = props.patch.ui.macros.find((entry) => entry.id === macroId);
    if (!macro) {
      return;
    }
    const binding = createDefaultBindingForParam(param, macro, resolveParamSliderRange(props.patch, selectedNode.id, param));
    props.onApplyOp({
      type: "bindMacro",
      macroId,
      bindingId: createId("bind"),
      nodeId: selectedNode.id,
      paramId: param.id,
      map: binding.map,
      min: binding.min,
      max: binding.max,
      points: binding.points
    });
  };

  const unbindParamFromMacro = (macroId: string, bindingId: string) => {
    if (props.structureLocked) {
      return;
    }
    props.onApplyOp({
      type: "unbindMacro",
      macroId,
      bindingId
    });
  };

  const visibleConnections = selectedNode
    ? props.patch.connections.filter(
        (connection) => connection.from.nodeId === selectedNode.id || connection.to.nodeId === selectedNode.id
      )
    : props.patch.connections;
  const visibleRemovedConnections = props.patchDiff.removedConnections.filter((connection) =>
    selectedNode ? connection.from.nodeId === selectedNode.id || connection.to.nodeId === selectedNode.id : true
  );
  const visibleValidationIssues = selectedNode ? resolveIssuesForNode(selectedNode.id, props.validationIssues) : props.validationIssues;
  const visibleRequiredPortIssues = resolveRequiredPortIssues(visibleValidationIssues);
  const visibleGeneralValidationIssues = visibleValidationIssues.filter((issue) => issue.code !== "required-port-unconnected");
  const visibleValidationHasErrors = visibleValidationIssues.some((issue) => issue.level === "error");
  return (
    <aside className="patch-inspector">
      <h3>Inspector</h3>
      {!selectedNode && !selectedProbe && <p className="muted">Select a module or probe to edit parameters.</p>}

      {selectedNode && props.selectedSchema && (
        <>
          <h4>
            {selectedNode.typeId} <small>{selectedNode.id}</small>
          </h4>
          {props.selectedSchema.params
            .filter((param) => shouldRenderParamInGenericInspector(selectedNode, param))
            .map((param) => {
            const value = selectedNode.params[param.id] ?? param.default;
            const nodeDiff = props.patchDiff.nodeDiffById.get(selectedNode.id);
            const bindingState = resolveParamBindingState(
              props.patch,
              selectedNode,
              param,
              props.selectedMacroId,
              selectedMacroKeyframeIndex,
              props.structureLocked
            );
            const removedBindingDiffs = props.patchDiff.removedBindingDiffsByNodeParamKey.get(`${selectedNode.id}:${param.id}`) ?? [];
            const currentBindingDiffs = bindingState.boundMacros.flatMap((macro) =>
              macro.bindings
                .filter((binding) => binding.nodeId === selectedNode.id && binding.paramId === param.id)
                .flatMap((binding) => {
                  const diff = props.patchDiff.currentBindingDiffByKey.get(`${macro.id}:${binding.id}`);
                  return diff ? [diff] : [];
                })
            );
            const paramDiffTone =
              nodeDiff?.status === "added" || nodeDiff?.changedParamIds.has(param.id) || currentBindingDiffs.length > 0
                ? "positive"
                : removedBindingDiffs.length > 0
                  ? "negative"
                  : null;
            const activeBinding = bindingState.activeBindingMacro?.bindings.find(
              (binding) => binding.nodeId === selectedNode.id && binding.paramId === param.id
            );
            const sliderRange = resolveParamSliderRange(props.patch, selectedNode.id, param);
            const controlValue =
              activeBinding && typeof selectedMacroValue === "number"
                ? resolveMacroBindingValue(activeBinding, selectedMacroValue)
                : value;
            const sliderControlValue =
              param.type === "float" && typeof controlValue === "number"
                ? clampNumericValue(controlValue, sliderRange.min, sliderRange.max)
                : controlValue;
            const controlDisabled = Boolean(
              props.structureLocked ||
              (bindingState.isExposed && !bindingState.isEditableSelectedMacroBinding)
            );
            const macroSummary =
              bindingState.activeBindingMacro && bindingState.editableSummary
                ? bindingState.editableSummary
                : bindingState.activeBindingMacro
                  ? `Select ${bindingState.activeBindingMacro.name} and stop on a keyframe notch to edit this binding.`
                  : null;

            return (
              <div
                key={param.id}
                className={`param-row${bindingState.isExposed ? " bound" : ""}${paramDiffTone ? ` diff-${paramDiffTone}` : ""}`}
              >
                <div className="param-row-header">
                  <span className="param-name">{param.label}</span>
                  <ParamMacroControl
                    disabled={props.structureLocked}
                    bindingMacro={bindingState.activeBindingMacro}
                    bindingMap={activeBinding?.map}
                    isEditing={bindingState.isEditableSelectedMacroBinding}
                    editableSummary={macroSummary}
                    macros={props.patch.ui.macros}
                    onBindNew={() => exposeMacro(param.id, param.label)}
                    onBindExisting={(macroId) => bindParamToMacro(param, macroId)}
                    onSetBindingMap={(map) => {
                      if (bindingState.activeBindingMacro && activeBinding) {
                        props.onApplyOp({
                          type: "setMacroBindingMap",
                          macroId: bindingState.activeBindingMacro.id,
                          bindingId: activeBinding.id,
                          map
                        });
                      }
                    }}
                    onUnbind={() => {
                      if (bindingState.activeBindingMacro && activeBinding) {
                        unbindParamFromMacro(bindingState.activeBindingMacro.id, activeBinding.id);
                      }
                    }}
                  />
                  {param.type === "float" && typeof sliderControlValue === "number" && (
                    <EditableParamValueLabel
                      id={`${selectedNode.id}:${param.id}:value`}
                      value={sliderControlValue}
                      min={sliderRange.min}
                      max={sliderRange.max}
                      disabled={controlDisabled}
                      onCommit={(nextValue) =>
                        commitParamValueChange({
                          patchProps: props,
                          selectedNode,
                          param,
                          bindingState,
                          selectedMacroValue,
                          value: nextValue
                        })
                      }
                    />
                  )}
                </div>
                <div className="param-control-stack">
                  {renderParamInlineSummary(selectedNode, param, value)}
                  <div className="param-value-editor">
                    <ParamValueControl
                        param={param}
                        value={sliderControlValue}
                        min={param.type === "float" ? sliderRange.min : undefined}
                        max={param.type === "float" ? sliderRange.max : undefined}
                        disabled={controlDisabled}
                        onChange={(nextValue) => {
                          commitParamValueChange({
                            patchProps: props,
                            selectedNode,
                            param,
                            bindingState,
                            selectedMacroValue,
                            value: nextValue
                          });
                        }}
                      />
                    {param.type === "float" && (
                      <div className="param-range-label-row">
                        <EditableExtremeLabel
                          id={`${selectedNode.id}:${param.id}:min`}
                          value={sliderRange.min}
                          min={param.range.min}
                          max={sliderRange.max}
                          disabled={props.structureLocked}
                          onCommit={(nextValue) => {
                            props.onApplyOp({
                              type: "setParamSliderRange",
                              nodeId: selectedNode.id,
                              paramId: param.id,
                              min: nextValue,
                              max: sliderRange.max
                            });
                          }}
                        />
                        <EditableExtremeLabel
                          id={`${selectedNode.id}:${param.id}:max`}
                          value={sliderRange.max}
                          min={sliderRange.min}
                          max={param.range.max}
                          disabled={props.structureLocked}
                          onCommit={(nextValue) => {
                            props.onApplyOp({
                              type: "setParamSliderRange",
                              nodeId: selectedNode.id,
                              paramId: param.id,
                              min: sliderRange.min,
                              max: nextValue
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {(bindingState.isExposed || removedBindingDiffs.length > 0) && (
                    <MacroBindingDetails
                      patch={props.patch}
                      nodeId={selectedNode.id}
                      paramId={param.id}
                      boundMacroIds={bindingState.boundMacros.map((macro) => macro.id)}
                      currentBindingDiffByKey={props.patchDiff.currentBindingDiffByKey}
                      removedBindingDiffs={removedBindingDiffs}
                    />
                  )}
                </div>
              </div>
            );
            })}
          {selectedNode.typeId === "SamplePlayer" && (
            <SamplePlayerInspectorSection
              node={selectedNode}
              structureLocked={props.structureLocked}
              onApplyOp={props.onApplyOp}
            />
          )}
        </>
      )}

      {selectedProbe && !selectedNode && (
        <ProbeInspectorSection
          patch={props.patch}
          selectedProbe={selectedProbe}
          previewCapture={props.previewCapture}
          previewProgress={props.previewProgress}
          attachingProbeId={props.attachingProbeId}
          onUpdateProbeSpectrumWindow={props.onUpdateProbeSpectrumWindow}
          onUpdateProbeFrequencyView={props.onUpdateProbeFrequencyView}
          onToggleAttachProbe={props.onToggleAttachProbe}
          onClearProbeTarget={props.onClearProbeTarget}
        />
      )}

      {props.patchDiff.hasBaseline && !selectedNode && !selectedProbe && (
        <>
          <h4>Baseline Diff</h4>
          {!props.patchDiff.hasChanges ? (
            <p className="ok">No changes relative to this tab&apos;s baseline patch.</p>
          ) : (
            <>
              <div className="patch-diff-summary-grid">
                {props.patchDiff.summary.addedNodeCount > 0 && <span className="patch-diff-summary-pill positive">+{props.patchDiff.summary.addedNodeCount} modules</span>}
                {props.patchDiff.summary.modifiedNodeCount > 0 && <span className="patch-diff-summary-pill positive">{props.patchDiff.summary.modifiedNodeCount} changed modules</span>}
                {props.patchDiff.summary.removedNodeCount > 0 && <span className="patch-diff-summary-pill negative">-{props.patchDiff.summary.removedNodeCount} modules</span>}
                {props.patchDiff.summary.addedMacroCount > 0 && <span className="patch-diff-summary-pill positive">+{props.patchDiff.summary.addedMacroCount} macros</span>}
                {props.patchDiff.summary.removedMacroCount > 0 && <span className="patch-diff-summary-pill negative">-{props.patchDiff.summary.removedMacroCount} macros</span>}
                {props.patchDiff.summary.addedConnectionCount > 0 && <span className="patch-diff-summary-pill positive">+{props.patchDiff.summary.addedConnectionCount} wires</span>}
                {props.patchDiff.summary.removedConnectionCount > 0 && <span className="patch-diff-summary-pill negative">-{props.patchDiff.summary.removedConnectionCount} wires</span>}
              </div>

              {props.patchDiff.removedNodes.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Modules</h5>
                  <div className="patch-diff-list">
                    {props.patchDiff.removedNodes.map((node) => (
                      <div key={node.id} className="patch-diff-list-row negative removed-diff-artifact">
                        <strong>{node.typeId}</strong> <span>{node.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {props.patchDiff.removedMacros.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Macros</h5>
                  <div className="patch-diff-list">
                    {props.patchDiff.removedMacros.map((macro) => (
                      <div key={macro.id} className="patch-diff-list-row negative removed-diff-artifact">
                        <strong>{macro.name}</strong> <span>{macro.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {props.patchDiff.removedBindingDiffs.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Macro Bindings</h5>
                  <div className="patch-diff-list">
                    {props.patchDiff.removedBindingDiffs.map((bindingDiff) => (
                      <div key={bindingDiff.key} className="patch-diff-list-row negative removed-diff-artifact">
                        <strong>{bindingDiff.macroName}</strong> <span>{bindingDiff.nodeId}.{bindingDiff.paramId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {props.patchDiff.removedConnections.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Wires</h5>
                  <div className="patch-diff-list">
                    {props.patchDiff.removedConnections.map((connection) => (
                      <div key={connection.id} className="patch-diff-list-row negative removed-diff-artifact">
                        <code>{connectionLabel(connection)}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <h4>{selectedNode ? "Required Connections" : "Unconnected Required Ports"}</h4>
      {visibleRequiredPortIssues.length === 0 && (
        <p className="ok">{selectedNode ? "All required module ports are connected." : "All required ports are connected."}</p>
      )}
      {visibleRequiredPortIssues.map((issue, index) => {
        const typeId = issue.context?.typeId ?? "Module";
        const portId = issue.context?.portId ?? "unknown";
        const direction = issue.context?.direction === "out" ? "output" : "input";
        const nodeId = issue.context?.nodeId;
        const label = selectedNode || !nodeId ? `${direction} '${portId}'` : `${nodeId}.${portId}`;
        return (
          <p key={`${issue.message}_${portId}_${index}`} className="error">
            {typeId}: required {label} is unconnected.
          </p>
        );
      })}

      <h4>{selectedNode ? "Module Connections" : "Connections"}</h4>
      {visibleConnections.length === 0 && <p className="muted">{selectedNode ? "No wires on this module." : "No wires yet."}</p>}
      {visibleConnections.map((connection) => (
        <div
          key={connection.id}
          className={`conn-row${props.patchDiff.currentConnectionStatusById.get(connection.id) === "added" ? " diff-positive" : ""}`}
        >
          <code>
            {connectionLabel(connection)}
          </code>
          <button disabled={props.structureLocked} onClick={() => !props.structureLocked && props.onApplyOp({ type: "disconnect", connectionId: connection.id })}>x</button>
        </div>
      ))}
      {visibleRemovedConnections.map((connection) => (
        <div key={connection.id} className="conn-row diff-negative removed-diff-artifact">
          <code>{connectionLabel(connection)}</code>
          <button type="button" disabled>
            removed
          </button>
        </div>
      ))}

      <h4>{selectedNode ? "Module Validation" : "Validation"}</h4>
      {visibleGeneralValidationIssues.length === 0 && (
        <p className={visibleValidationHasErrors ? "error" : "ok"}>
          {visibleValidationHasErrors
            ? selectedNode
              ? "Module invalid. Fix required connections above."
              : "Patch invalid. Fix required connections above."
            : selectedNode
              ? "Module valid."
              : "Patch valid."}
        </p>
      )}
      {visibleGeneralValidationIssues.map((issue, index) => (
        <p key={`${issue.message}_${index}`} className={issue.level === "error" ? "error" : "warn"}>
          {issue.message}
        </p>
      ))}
    </aside>
  );
}
