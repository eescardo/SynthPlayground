import { useEffect, useState } from "react";
import {
  getMacroKeyframePositions,
  resolveMacroBindingValue
} from "@/lib/patch/macroKeyframes";
import { PatchDiff } from "@/lib/patch/diff";
import { EditableNumberLabel, MacroBindingDetails, ParamMacroControl } from "@/components/patch/PatchInspectorControls";
import { createId } from "@/lib/ids";
import { MacroBinding, Patch, PatchMacro, PatchNode, PatchParamSliderRange, ParamSchema, ParamValue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { samplePlayerPitchSemisToRootPitch } from "@/lib/patch/samplePlayer";

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

function createDefaultBindingForParam(
  param: ParamSchema,
  macro: PatchMacro,
  range = getParamNumericRange(param)
): Pick<MacroBinding, "map" | "min" | "max" | "points"> {
  if (macro.keyframeCount > 2) {
    return {
      map: "linear",
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

export function shouldRenderParamInGenericInspector(node: PatchNode, param: ParamSchema) {
  if (node.typeId === "SamplePlayer" && (param.id === "start" || param.id === "end")) {
    return false;
  }
  return true;
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

function commitParamValueChange(props: {
  patch: Patch;
  selectedNode: PatchNode;
  param: ParamSchema;
  bindingState: ReturnType<typeof resolveParamBindingState>;
  selectedMacroValue: number | undefined;
  structureLocked?: boolean;
  value: ParamValue;
  onApplyOp: (op: PatchOp) => void;
}) {
  if (props.structureLocked) {
    return;
  }
  if (props.bindingState.isEditableSelectedMacroBinding && props.bindingState.activeBindingMacro && typeof props.value === "number") {
    props.onApplyOp({
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
    props.onApplyOp({
      type: "setParam",
      nodeId: props.selectedNode.id,
      paramId: props.param.id,
      value: props.value
    });
  }
}

interface PatchModuleParameterProps {
  patch: Patch;
  patchDiff: PatchDiff;
  selectedNode: PatchNode;
  param: ParamSchema;
  selectedMacroId?: string;
  selectedMacroValue?: number;
  selectedMacroKeyframeIndex: number | null;
  structureLocked?: boolean;
  onApplyOp: (op: PatchOp) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
}

export function PatchModuleParameter(props: PatchModuleParameterProps) {
  const value = props.selectedNode.params[props.param.id] ?? props.param.default;
  const nodeDiff = props.patchDiff.nodeDiffById.get(props.selectedNode.id);
  const bindingState = resolveParamBindingState(
    props.patch,
    props.selectedNode,
    props.param,
    props.selectedMacroId,
    props.selectedMacroKeyframeIndex,
    props.structureLocked
  );
  const removedBindingDiffs = props.patchDiff.removedBindingDiffsByNodeParamKey.get(`${props.selectedNode.id}:${props.param.id}`) ?? [];
  const currentBindingDiffs = bindingState.boundMacros.flatMap((macro) =>
    macro.bindings
      .filter((binding) => binding.nodeId === props.selectedNode.id && binding.paramId === props.param.id)
      .flatMap((binding) => {
        const diff = props.patchDiff.currentBindingDiffByKey.get(`${macro.id}:${binding.id}`);
        return diff ? [diff] : [];
      })
  );
  const paramDiffTone =
    nodeDiff?.status === "added" || nodeDiff?.changedParamIds.has(props.param.id) || currentBindingDiffs.length > 0
      ? "positive"
      : removedBindingDiffs.length > 0
        ? "negative"
        : null;
  const activeBinding = bindingState.activeBindingMacro?.bindings.find(
    (binding) => binding.nodeId === props.selectedNode.id && binding.paramId === props.param.id
  );
  const sliderRange = resolveParamSliderRange(props.patch, props.selectedNode.id, props.param);
  const controlValue =
    activeBinding && typeof props.selectedMacroValue === "number"
      ? resolveMacroBindingValue(activeBinding, props.selectedMacroValue)
      : value;
  const sliderControlValue =
    props.param.type === "float" && typeof controlValue === "number"
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

  const bindParamToMacro = (macroId: string) => {
    if (props.structureLocked) {
      return;
    }
    const macro = props.patch.ui.macros.find((entry) => entry.id === macroId);
    if (!macro) {
      return;
    }
    const binding = createDefaultBindingForParam(props.param, macro, sliderRange);
    props.onApplyOp({
      type: "bindMacro",
      macroId,
      bindingId: createId("bind"),
      nodeId: props.selectedNode.id,
      paramId: props.param.id,
      map: binding.map,
      min: binding.min,
      max: binding.max,
      points: binding.points
    });
  };

  const commitValue = (nextValue: ParamValue) => {
    commitParamValueChange({
      patch: props.patch,
      selectedNode: props.selectedNode,
      param: props.param,
      bindingState,
      selectedMacroValue: props.selectedMacroValue,
      structureLocked: props.structureLocked,
      value: nextValue,
      onApplyOp: props.onApplyOp
    });
  };

  return (
    <div
      className={`param-row${bindingState.isExposed ? " bound" : ""}${paramDiffTone ? ` diff-${paramDiffTone}` : ""}`}
    >
      <div className="param-row-header">
        <span className="param-name">{props.param.label}</span>
        <ParamMacroControl
          disabled={props.structureLocked}
          bindingMacro={bindingState.activeBindingMacro}
          bindingMap={activeBinding?.map}
          isEditing={bindingState.isEditableSelectedMacroBinding}
          editableSummary={macroSummary}
          macros={props.patch.ui.macros}
          onBindNew={() => {
            if (!props.structureLocked) {
              props.onExposeMacro(props.selectedNode.id, props.param.id, props.param.label);
            }
          }}
          onBindExisting={bindParamToMacro}
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
            if (bindingState.activeBindingMacro && activeBinding && !props.structureLocked) {
              props.onApplyOp({
                type: "unbindMacro",
                macroId: bindingState.activeBindingMacro.id,
                bindingId: activeBinding.id
              });
            }
          }}
        />
        {props.param.type === "float" && typeof sliderControlValue === "number" && (
          <EditableNumberLabel
            id={`${props.selectedNode.id}:${props.param.id}:value`}
            value={sliderControlValue}
            min={sliderRange.min}
            max={sliderRange.max}
            className="param-current-value-label"
            inputClassName="param-current-value-input"
            disabled={controlDisabled}
            onCommit={commitValue}
          />
        )}
      </div>
      <div className="param-control-stack">
        {renderParamInlineSummary(props.selectedNode, props.param, value)}
        <div className="param-value-editor">
          <ParamValueControl
            param={props.param}
            value={sliderControlValue}
            min={props.param.type === "float" ? sliderRange.min : undefined}
            max={props.param.type === "float" ? sliderRange.max : undefined}
            disabled={controlDisabled}
            onChange={commitValue}
          />
          {props.param.type === "float" && (
            <div className="param-range-label-row">
              <EditableNumberLabel
                id={`${props.selectedNode.id}:${props.param.id}:min`}
                value={sliderRange.min}
                min={props.param.range.min}
                max={sliderRange.max}
                className="param-range-label"
                inputClassName="param-range-label-input"
                disabled={props.structureLocked}
                onCommit={(nextValue) => {
                  props.onApplyOp({
                    type: "setParamSliderRange",
                    nodeId: props.selectedNode.id,
                    paramId: props.param.id,
                    min: nextValue,
                    max: sliderRange.max
                  });
                }}
              />
              <EditableNumberLabel
                id={`${props.selectedNode.id}:${props.param.id}:max`}
                value={sliderRange.max}
                min={sliderRange.min}
                max={props.param.range.max}
                className="param-range-label"
                inputClassName="param-range-label-input"
                disabled={props.structureLocked}
                onCommit={(nextValue) => {
                  props.onApplyOp({
                    type: "setParamSliderRange",
                    nodeId: props.selectedNode.id,
                    paramId: props.param.id,
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
            nodeId={props.selectedNode.id}
            paramId={props.param.id}
            boundMacroIds={bindingState.boundMacros.map((macro) => macro.id)}
            currentBindingDiffByKey={props.patchDiff.currentBindingDiffByKey}
            removedBindingDiffs={removedBindingDiffs}
          />
        )}
      </div>
    </div>
  );
}
