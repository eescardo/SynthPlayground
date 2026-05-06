import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  getMacroKeyframePositions
} from "@/lib/patch/macroKeyframes";
import { PatchDiff } from "@/lib/patch/diff";
import { EditableNumberLabel, MacroBindingDetails, ParamMacroControl } from "@/components/patch/PatchInspectorControls";
import { resolveParamBindingState, resolveParamControlValue } from "@/components/patch/patchModuleParameterState";
import { createMacroBindingId, createPatchMacroBindingKey } from "@/lib/patch/macroBindings";
import { clamp, clampRange } from "@/lib/numeric";
import { MacroBinding, Patch, PatchMacro, PatchNode, PatchParamSliderRange, ParamSchema, ParamValue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { samplePlayerPitchSemisToRootPitch } from "@/lib/patch/samplePlayer";

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
    if (param.id === "attack" || param.id === "decay" || param.id === "release") {
      return { min: schemaRange.min, max: Math.min(schemaRange.max, 1000) };
    }
    return schemaRange;
  }
  const min = clamp(storedRange.min, param.range.min, param.range.max);
  const max = clamp(storedRange.max, param.range.min, param.range.max);
  return clampRange(min, max);
}

function resolveCurrentValueUnitDisplay(param: ParamSchema) {
  if (param.type !== "float") {
    return null;
  }
  const isNormalizedPercent = param.range.min === 0 && param.range.max === 1 && (param.unit === "linear" || param.unit === "ratio");
  if (isNormalizedPercent && param.id !== "curve") {
    return { label: "%", scale: 100 };
  }
  switch (param.unit) {
    case "Hz":
    case "ms":
    case "s":
    case "dB":
    case "oct":
    case "semitones":
    case "cents":
      return { label: param.unit, scale: 1 };
    default:
      return null;
  }
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
  onPreviewChange?: (value: ParamValue) => void;
}) {
  const { param, value, disabled, onChange } = props;

  if (param.type === "float") {
    return (
      <FloatParamValueControl
        param={param}
        value={Number(value)}
        min={props.min}
        max={props.max}
        disabled={disabled}
        onChange={onChange}
        onPreviewChange={props.onPreviewChange}
      />
    );
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
  onPreviewChange?: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(props.value);
  const pendingCommitRef = useRef(false);
  const min = props.min ?? props.param.range.min;
  const max = props.max ?? props.param.range.max;
  const sliderPercent = max === min ? 0 : clamp(((draftValue - min) / (max - min)) * 100, 0, 100);

  useEffect(() => {
    setDraftValue(props.value);
  }, [props.value]);

  const commitDraft = (nextValue: number) => {
    if (!pendingCommitRef.current) {
      return;
    }
    pendingCommitRef.current = false;
    props.onChange(nextValue);
  };

  return (
    <input
      className="param-value-slider"
      type="range"
      min={min}
      max={max}
      step={props.param.step ?? Math.max((max - min) / 500, 0.000001)}
      value={draftValue}
      disabled={props.disabled}
      style={{ "--param-slider-percent": `${sliderPercent}%` } as CSSProperties}
      onChange={(event) => {
        const nextValue = Number(event.target.value);
        pendingCommitRef.current = true;
        setDraftValue(nextValue);
        props.onPreviewChange?.(nextValue);
      }}
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

function shouldRenderCurveScaleLabels(node: PatchNode, param: ParamSchema) {
  return node.typeId === "ADSR" && param.id === "curve" && param.type === "float";
}

export function shouldRenderParamInGenericInspector(node: PatchNode, param: ParamSchema) {
  if (node.typeId === "SamplePlayer" && (param.id === "start" || param.id === "end")) {
    return false;
  }
  return true;
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
  onPreviewParamValue?: (nodeId: string, paramId: string, value: ParamValue) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
}

export function PatchModuleParameter(props: PatchModuleParameterProps) {
  const rawValue = props.selectedNode.params[props.param.id] ?? props.param.default;
  const value = rawValue;
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
        const diff = props.patchDiff.currentBindingDiffByKey.get(createPatchMacroBindingKey(props.patch, macro.id, binding));
        return diff ? [diff] : [];
      })
  );
  const hasParamRangeDiff = Boolean(nodeDiff?.changedParamRangeIds.has(props.param.id));
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
  const controlValue = resolveParamControlValue({
    activeBinding,
    activeBindingMacroId: bindingState.activeBindingMacro?.id,
    selectedMacroId: props.selectedMacroId,
    selectedMacroValue: props.selectedMacroValue,
    value
  });
  const sliderControlValue =
    props.param.type === "float" && typeof controlValue === "number"
      ? clamp(controlValue, sliderRange.min, sliderRange.max)
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
  const unitDisplay = resolveCurrentValueUnitDisplay(props.param);
  const floatParam = props.param.type === "float" ? props.param : null;
  const currentDisplayValue = sliderControlValue;
  const currentDisplayMin = sliderRange.min;
  const currentDisplayMax = sliderRange.max;

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
      bindingId: createMacroBindingId(macroId, props.selectedNode.id, props.param.id),
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
  const commitDisplayedValue = commitValue;

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
        {floatParam && typeof sliderControlValue === "number" && (
          <span className="param-current-value-shell">
            <EditableNumberLabel
              id={`${props.selectedNode.id}:${props.param.id}:value`}
              value={Number(currentDisplayValue)}
              min={currentDisplayMin}
              max={currentDisplayMax}
              className="param-current-value-label"
              inputClassName="param-current-value-input"
              displayScale={unitDisplay?.scale}
              disabled={controlDisabled}
              onCommit={commitDisplayedValue}
            />
            {unitDisplay && (
              <span className="param-current-value-unit">{unitDisplay.label}</span>
            )}
          </span>
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
            onPreviewChange={(nextValue) => props.onPreviewParamValue?.(props.selectedNode.id, props.param.id, nextValue)}
          />
          {floatParam && shouldRenderCurveScaleLabels(props.selectedNode, props.param) && (
            <div className="param-curve-label-row" aria-hidden="true">
              <span>exp</span>
              <span>linear</span>
              <span>log</span>
            </div>
          )}
          {floatParam && !shouldRenderCurveScaleLabels(props.selectedNode, props.param) && (
            <div className={`param-range-label-row${hasParamRangeDiff ? " diff-positive" : ""}`}>
              <EditableNumberLabel
                id={`${props.selectedNode.id}:${props.param.id}:min`}
                value={sliderRange.min}
                min={floatParam.range.min}
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
              {hasParamRangeDiff && <span className="param-range-diff-badge">Range changed</span>}
              <EditableNumberLabel
                id={`${props.selectedNode.id}:${props.param.id}:max`}
                value={sliderRange.max}
                min={sliderRange.min}
                max={floatParam.range.max}
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
