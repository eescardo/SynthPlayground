import {
  resolveMacroBindingValue,
  resolveMacroKeyframeIndexAtValue
} from "@/lib/patch/macroKeyframes";
import { ProbeInspectorSection } from "@/components/patch/ProbeInspectorSection";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch, PatchNode, ParamSchema, ParamValue, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

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

function MacroBindingDetails(props: {
  patch: Patch;
  nodeId: string;
  paramId: string;
  exposedLabel: string;
  boundMacroIds: string[];
  editableSummary?: string | null;
}) {
  const boundMacros = props.patch.ui.macros.filter((macro) => props.boundMacroIds.includes(macro.id));

  return (
    <>
      <button type="button" className="macro-binding-pill" disabled title={props.exposedLabel}>
        {props.exposedLabel}
      </button>
      <div className="macro-binding-details">
        {props.editableSummary && <div className="macro-binding-edit-summary">{props.editableSummary}</div>}
        {boundMacros.map((macro) =>
          macro.bindings
            .filter((binding) => binding.nodeId === props.nodeId && binding.paramId === props.paramId)
            .map((binding) => (
              <div key={binding.id} className="macro-binding-detail-card">
                <div className="macro-binding-detail-mode">
                  {binding.map === "piecewise" ? "Keyframed" : binding.map === "exp" ? "Exponential" : "Linear"}
                </div>
                {binding.map === "piecewise" && binding.points && binding.points.length >= 2 ? (
                  <>
                    <div className="macro-binding-points">
                      {binding.points.map((point, index) => (
                        <span key={`${binding.id}_${point.x}_${index}`} className="macro-binding-point-chip">
                          {point.x.toFixed(2)}:{formatBindingValue(point.y)}
                        </span>
                      ))}
                    </div>
                    <div className="macro-binding-segments">Segments: linear interpolation</div>
                  </>
                ) : (
                  <div className="macro-binding-range">
                    Range: {formatBindingValue(binding.min ?? 0)} - {formatBindingValue(binding.max ?? 1)}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    </>
  );
}

function ParamValueControl(props: {
  param: ParamSchema;
  value: ParamValue;
  disabled?: boolean;
  onChange: (value: ParamValue) => void;
}) {
  const { param, value, disabled, onChange } = props;

  if (param.type === "float") {
    return (
      <input
        type="range"
        min={param.range.min}
        max={param.range.max}
        step={param.step ?? (param.range.max - param.range.min) / 500}
        value={Number(value)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
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

interface PatchInspectorProps {
  patch: Patch;
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
  const exposedLabel =
    boundMacros.length === 1
      ? `Exposed as '${boundMacros[0].name}'`
      : `Exposed as ${boundMacros.map((macro) => `'${macro.name}'`).join(", ")}`;
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
    exposedLabel,
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

  const visibleConnections = selectedNode
    ? props.patch.connections.filter(
        (connection) => connection.from.nodeId === selectedNode.id || connection.to.nodeId === selectedNode.id
      )
    : props.patch.connections;
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
          {props.selectedSchema.params.map((param) => {
            const value = selectedNode.params[param.id] ?? param.default;
            const bindingState = resolveParamBindingState(
              props.patch,
              selectedNode,
              param,
              props.selectedMacroId,
              selectedMacroKeyframeIndex,
              props.structureLocked
            );

            return (
              <div key={param.id} className={`param-row${bindingState.isExposed ? " bound" : ""}`}>
                <span>{param.label}</span>
                <div className="param-control-stack">
                  {(!bindingState.isExposed || bindingState.isEditableSelectedMacroBinding) && (
                    <ParamValueControl
                      param={param}
                      value={
                        bindingState.isEditableSelectedMacroBinding && bindingState.activeBindingMacro
                          ? resolveMacroBindingValue(
                              bindingState.activeBindingMacro.bindings.find(
                                (binding) => binding.nodeId === selectedNode.id && binding.paramId === param.id
                              )!,
                              selectedMacroValue ?? 0
                            )
                          : value
                      }
                      disabled={props.structureLocked}
                      onChange={(nextValue) => {
                        if (props.structureLocked) {
                          return;
                        }
                        if (bindingState.isEditableSelectedMacroBinding && bindingState.activeBindingMacro && typeof nextValue === "number") {
                          props.onApplyOp({
                            type: "setMacroBindingKeyframeValue",
                            macroId: bindingState.activeBindingMacro.id,
                            nodeId: selectedNode.id,
                            paramId: param.id,
                            normalized: selectedMacroValue ?? 0,
                            value: nextValue
                          });
                          return;
                        }
                        props.onApplyOp({
                          type: "setParam",
                          nodeId: selectedNode.id,
                          paramId: param.id,
                          value: nextValue
                        });
                      }}
                    />
                  )}
                  {bindingState.isExposed && (
                    <MacroBindingDetails
                      patch={props.patch}
                      nodeId={selectedNode.id}
                      paramId={param.id}
                      exposedLabel={bindingState.exposedLabel}
                      boundMacroIds={bindingState.boundMacros.map((macro) => macro.id)}
                      editableSummary={bindingState.editableSummary}
                    />
                  )}
                </div>
                {bindingState.isExposed ? (
                  <button type="button" disabled className="patch-inspector-status-button">
                    {props.structureLocked ? "Preset lock" : bindingState.isEditableSelectedMacroBinding ? "Keyframe edit" : "Locked"}
                  </button>
                ) : (
                  <button type="button" disabled={props.structureLocked} onClick={() => exposeMacro(param.id, param.label)}>
                    Expose Macro
                  </button>
                )}
              </div>
            );
          })}
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
        <div key={connection.id} className="conn-row">
          <code>
            {connection.from.nodeId}.{connection.from.portId} {" -> "} {connection.to.nodeId}.{connection.to.portId}
          </code>
          <button disabled={props.structureLocked} onClick={() => !props.structureLocked && props.onApplyOp({ type: "disconnect", connectionId: connection.id })}>x</button>
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
