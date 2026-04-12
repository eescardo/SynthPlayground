import {
  resolveMacroBindingValue,
  resolveMacroKeyframeIndexAtValue
} from "@/lib/patch/macroKeyframes";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { normalizeProbeSamples } from "@/lib/patch/probes";
import { Patch, PatchNode, ParamSchema, ParamValue, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeTarget, PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

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
        step={(param.range.max - param.range.min) / 500}
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
  onToggleAttachProbe: (probeId: string) => void;
  onClearProbeTarget: (probeId: string) => void;
}

function resolveIssuesForNode(nodeId: string, issues: PatchValidationIssue[]) {
  return issues.filter((issue) =>
    Object.values(issue.context ?? {}).some((value) => value.includes(nodeId))
  );
}

function formatProbeTarget(patch: Patch, target?: PatchProbeTarget) {
  if (!target) {
    return "Not attached";
  }
  if (target.kind === "connection") {
    const connection = patch.connections.find((entry) => entry.id === target.connectionId);
    return connection
      ? `${connection.from.nodeId}.${connection.from.portId} -> ${connection.to.nodeId}.${connection.to.portId}`
      : "Wire target unavailable";
  }
  return `${target.nodeId}.${target.portId} (${target.portKind})`;
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
  const selectedProbeNormalizedSamples =
    selectedProbe && props.previewCapture?.samples?.length
      ? normalizeProbeSamples(props.previewCapture.samples.slice(0, props.previewCapture.capturedSamples || props.previewCapture.samples.length))
      : [];

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
            const boundMacros = props.patch.ui.macros.filter((macro) =>
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
              !props.structureLocked &&
              props.selectedMacroId === activeBindingMacro?.id &&
              selectedMacroKeyframeIndex !== null &&
              param.type === "float" &&
              typeof value === "number";
            const editableSummary =
              activeBindingMacro && props.selectedMacroId === activeBindingMacro.id
                ? selectedMacroKeyframeIndex !== null
                  ? `Editing ${activeBindingMacro.name} at keyframe ${selectedMacroKeyframeIndex + 1}/${activeBindingMacro.keyframeCount}`
                  : "Bound values unlock when the selected macro is parked on a keyframe notch."
                : activeBindingMacro
                  ? `Select ${activeBindingMacro.name} and stop on a keyframe notch to edit this binding.`
                  : null;

            return (
              <div key={param.id} className={`param-row${isExposed ? " bound" : ""}`}>
                <span>{param.label}</span>
                <div className="param-control-stack">
                  {(!isExposed || isEditableSelectedMacroBinding) && (
                    <ParamValueControl
                      param={param}
                      value={
                        isEditableSelectedMacroBinding && activeBindingMacro
                          ? resolveMacroBindingValue(activeBindingMacro.bindings.find((binding) => binding.nodeId === selectedNode.id && binding.paramId === param.id)!, selectedMacroValue ?? 0)
                          : value
                      }
                      disabled={props.structureLocked}
                      onChange={(nextValue) => {
                        if (props.structureLocked) {
                          return;
                        }
                        if (isEditableSelectedMacroBinding && activeBindingMacro && typeof nextValue === "number") {
                          props.onApplyOp({
                            type: "setMacroBindingKeyframeValue",
                            macroId: activeBindingMacro.id,
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
                  {isExposed && (
                    <MacroBindingDetails
                      patch={props.patch}
                      nodeId={selectedNode.id}
                      paramId={param.id}
                      exposedLabel={exposedLabel}
                      boundMacroIds={boundMacros.map((macro) => macro.id)}
                      editableSummary={editableSummary}
                    />
                  )}
                </div>
                {isExposed ? (
                  <button type="button" disabled className="patch-inspector-status-button">
                    {props.structureLocked ? "Preset lock" : isEditableSelectedMacroBinding ? "Keyframe edit" : "Locked"}
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
        <>
          <h4>
            {selectedProbe.name} <small>{selectedProbe.kind}</small>
          </h4>
          <div className="param-row">
            <span>Attachment</span>
            <div className="param-control-stack">
              <code>{formatProbeTarget(props.patch, selectedProbe.target)}</code>
            </div>
            <button type="button" onClick={() => props.onToggleAttachProbe(selectedProbe.id)}>
              {props.attachingProbeId === selectedProbe.id ? "Cancel" : "Attach"}
            </button>
          </div>
          <div className="param-row">
            <span>Expanded</span>
            <div className="param-control-stack">
              <div className="macro-binding-edit-summary">
                {selectedProbe.expanded
                  ? "Large probe view is open. Drag it by the header or click the face to collapse it."
                  : "Click the probe face to expand it in place."}
              </div>
            </div>
            <button type="button" disabled className="patch-inspector-status-button">
              {selectedProbe.expanded ? "Open" : "Closed"}
            </button>
          </div>
          {selectedProbe.kind === "spectrum" && (
            <div className="param-row">
              <span>Window</span>
              <div className="param-control-stack">
                <select
                  value={selectedProbe.spectrumWindowSize ?? 1024}
                  onChange={(event) => props.onUpdateProbeSpectrumWindow(selectedProbe.id, Number(event.target.value))}
                >
                  {[256, 512, 1024, 2048].map((windowSize) => (
                    <option key={windowSize} value={windowSize}>
                      {windowSize}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!selectedProbe.target}
                onClick={() => props.onClearProbeTarget(selectedProbe.id)}
              >
                Clear Target
              </button>
            </div>
          )}
          {selectedProbe.kind === "scope" && (
            <div className="param-row">
              <span>Signal</span>
              <div className="param-control-stack">
                <div className="macro-binding-edit-summary">
                  {selectedProbeNormalizedSamples.length > 0
                    ? `Normalized from ${props.previewCapture?.capturedSamples ?? 0} captured samples. Playhead ${Math.round(props.previewProgress * 100)}%.`
                    : "Preview the patch to populate scope data."}
                </div>
              </div>
              <button
                type="button"
                disabled={!selectedProbe.target}
                onClick={() => props.onClearProbeTarget(selectedProbe.id)}
              >
                Clear Target
              </button>
            </div>
          )}
          {selectedProbe.kind === "spectrum" && (
            <p className="muted">
              Spectrum follows the current preview playhead and analyzes the active signal window over time.
            </p>
          )}
          {selectedProbe.kind === "scope" && (
            <p className="muted">
              Scope view normalizes the captured signal so quiet patches still render visibly.
            </p>
          )}
        </>
      )}

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
      {visibleValidationIssues.length === 0 && <p className="ok">{selectedNode ? "Module valid." : "Patch valid."}</p>}
      {visibleValidationIssues.map((issue, index) => (
        <p key={`${issue.message}_${index}`} className={issue.level === "error" ? "error" : "warn"}>
          {issue.message}
        </p>
      ))}
    </aside>
  );
}
