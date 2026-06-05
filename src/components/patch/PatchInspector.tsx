import { useCallback, useEffect, useRef } from "react";
import { useInlineRename } from "@/hooks/useInlineRename";
import { useRenameActivation } from "@/hooks/useRenameActivation";
import { resolveMacroKeyframeIndexAtValue } from "@/lib/patch/macroKeyframes";
import { PatchModuleParameter, shouldRenderParamInGenericInspector } from "@/components/patch/PatchModuleParameter";
import { SamplePlayerInspectorSection } from "@/components/patch/SamplePlayerInspectorSection";
import { ProbeInspectorSection } from "@/components/patch/ProbeInspectorSection";
import {
  formatPatchEndpointLabel,
  formatPatchPortLabel,
  formatPatchParamTargetLabel,
  isPatchOutputEndpoint
} from "@/components/patch/patchInspectablePorts";
import { isPatchOutputPortId } from "@/lib/patch/ports";
import { compressorDerivedParamsForSquash } from "@/lib/patch/compressor";
import { formatDb, OutputLimiterPreview } from "@/lib/patch/qualityMeter";
import { PatchInspectorActions, PatchInspectorModel } from "@/components/patch/patchEditorSession";
import { Patch, PatchNode, PatchPort, PatchValidationIssue } from "@/types/patch";

function connectionLabel(patch: Patch, connection: Pick<Patch["connections"][number], "from" | "to">) {
  return `${formatPatchEndpointLabel(patch, connection.from)} -> ${formatPatchEndpointLabel(patch, connection.to)}`;
}

function requiredPortIssueLabel(patch: Patch, issue: PatchValidationIssue, selectedNode?: PatchNode) {
  const portId = issue.context?.portId ?? "unknown";
  const direction = issue.context?.direction === "out" ? "output" : "input";
  const nodeId = issue.context?.nodeId;
  if (nodeId && isPatchOutputEndpoint(patch, { nodeId, portId })) {
    return {
      subject: "output",
      target: formatPatchEndpointLabel(patch, { nodeId, portId })
    };
  }
  return {
    subject: issue.context?.typeId ?? "Module",
    target: selectedNode || !nodeId ? `${direction} '${portId}'` : `${nodeId}.${portId}`
  };
}

function CompressorDerivedReadouts({ node }: { node: PatchNode }) {
  const derived = compressorDerivedParamsForSquash(
    Number(node.params.squash ?? 0.5),
    Number(node.params.attackMs ?? 20)
  );
  return (
    <div className="param-row compressor-derived-readouts">
      <div className="param-row-header">
        <span className="param-name">Derived</span>
      </div>
      <div className="param-derived-grid">
        <span>Threshold</span>
        <strong>{derived.thresholdDb.toFixed(0)} dB</strong>
        <span>Ratio</span>
        <strong>{derived.ratio.toFixed(1)}:1</strong>
        <span>Auto Gain Max</span>
        <strong>{derived.autoGainDb.toFixed(1)} dB</strong>
      </div>
    </div>
  );
}

function OutputLimiterReadout({ preview }: { preview?: OutputLimiterPreview | null }) {
  if (!preview?.populated) {
    return (
      <div className={`param-row output-limiter-readout empty${preview?.limiterEnabled === false ? " disabled" : ""}`}>
        <div className="param-row-header">
          <span className="param-name">Limiter Activity</span>
          {preview?.limiterEnabled === false && <span className="output-limiter-pill">Limiter off</span>}
        </div>
        <div className="output-limiter-empty">Preview a note to populate output limiter metering.</div>
      </div>
    );
  }

  const reductionRatio = Math.min(1, Math.max(0, Math.abs(preview.reductionDb) / 18));
  const drivenRatio = Math.min(1, Math.max(0, preview.drivenPeak));
  const postRatio = Math.min(1, Math.max(0, preview.post?.peak ?? 0));
  return (
    <div
      className={`param-row output-limiter-readout${preview.nearClipActive ? " active" : ""}${
        !preview.limiterEnabled ? " disabled" : ""
      }`}
    >
      <div className="param-row-header">
        <span className="param-name">Limiter Activity</span>
        <span className="output-limiter-pill">{preview.limiterEnabled ? "Limiter on" : "Limiter off"}</span>
      </div>
      <div className="output-limiter-visual">
        <div
          className="output-limiter-meter"
          title="Driven level: limiter input after the configured output gain, before limiting."
        >
          <span style={{ height: `${drivenRatio * 100}%` }} />
          <strong>DRV</strong>
        </div>
        <div
          className="output-limiter-curve"
          title="Limiter transfer curve. Dashed line is unprocessed level; gold line is the limited output curve; the dot is this preview's current peak."
        >
          <svg viewBox="0 0 100 44" preserveAspectRatio="none">
            <title>Limiter curve with raw, limited, and current peak indicators</title>
            <path d="M7 37 C 34 35, 60 24, 93 7" className="output-limiter-curve-raw" />
            <path d="M7 37 C 28 34, 54 14, 93 8" className="output-limiter-curve-shaped" />
            <circle cx={14 + drivenRatio * 72} cy={37 - postRatio * 29} r="3.5" />
            <text x="10" y="12" className="output-limiter-legend raw">
              raw
            </text>
            <text x="75" y="18" className="output-limiter-legend shaped">
              limited
            </text>
            <text x="5" y="41" className="output-limiter-axis-label">
              in
            </text>
            <text x="91" y="41" className="output-limiter-axis-label">
              out
            </text>
          </svg>
        </div>
        <div className="output-limiter-meter post" title="Post level: final output after gain and limiter.">
          <span style={{ height: `${postRatio * 100}%` }} />
          <strong>OUT</strong>
        </div>
      </div>
      <div
        className="output-limiter-reduction-row"
        title="Gain reduction amount: wider means the limiter pulled the preview peak down more."
      >
        <span>Gain reduction</span>
        <div className="output-limiter-reduction-track">
          <div className="output-limiter-reduction" style={{ width: `${reductionRatio * 100}%` }} />
        </div>
        <strong>{preview.limiterEnabled ? `${preview.reductionDb.toFixed(1)} dB` : "0.0 dB"}</strong>
      </div>
      <div className="output-limiter-grid">
        <span>Output gain</span>
        <strong>
          {preview.gainDb.toFixed(1)} dB <em>target: taste</em>
        </strong>
        <span>Driven peak</span>
        <strong>
          {formatDb(preview.drivenPeakDb)} <em>max: 0.0 dB</em>
        </strong>
        <span>Post peak</span>
        <strong>
          {formatDb(preview.postPeakDb)} <em>ideal: -1 to -3 dB</em>
        </strong>
        <span>Reduction</span>
        <strong>
          {preview.limiterEnabled ? `${preview.reductionDb.toFixed(1)} dB` : "0.0 dB"} <em>ideal: 0 to -3 dB</em>
        </strong>
        <span>Near clip</span>
        <strong>
          {preview.post?.nearClipCount ?? 0} <em>ideal: 0</em>
        </strong>
      </div>
    </div>
  );
}

interface PatchInspectorProps {
  model: PatchInspectorModel;
  actions: PatchInspectorActions;
}

interface ModuleHeadingProps {
  node: PatchNode;
  structureLocked?: boolean;
  onRenameNode: (nodeId: string, newNodeId: string) => void;
}

function ModuleHeading(props: ModuleHeadingProps) {
  const rename = useInlineRename({
    value: props.node.id,
    onCommit: (newNodeId) => props.onRenameNode(props.node.id, newNodeId)
  });
  const renameActivation = useRenameActivation<string>();
  const startRename = useCallback(() => {
    rename.setEditing(true);
  }, [rename]);

  return (
    <h4 className="patch-inspector-module-heading">
      <span>{props.node.typeId}</span>
      {rename.editing ? (
        <input
          className="patch-inspector-module-name-input"
          aria-label="Module id"
          autoFocus
          size={Math.max(1, rename.draft.length)}
          value={rename.draft}
          onBlur={rename.commit}
          onChange={(event) => rename.setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              rename.commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              rename.cancel();
            }
            event.stopPropagation();
          }}
        />
      ) : (
        <small
          className={`patch-inspector-module-name${renameActivation.isArmed(props.node.id) ? " rename-armed" : ""}`}
          role="button"
          tabIndex={props.structureLocked ? -1 : 0}
          aria-label={`Rename module ${props.node.id}`}
          aria-disabled={props.structureLocked ? true : undefined}
          {...renameActivation.getRenameTriggerProps({
            id: props.node.id,
            enabled: !props.structureLocked,
            onStartRename: startRename
          })}
        >
          {props.node.id}
        </small>
      )}
    </h4>
  );
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

function resolveBrokenMacroBindingIssues(issues: PatchValidationIssue[], macroId?: string) {
  return issues.filter(
    (issue) =>
      (issue.code === "macro-binding-missing-node" || issue.code === "macro-binding-invalid-param") &&
      (!macroId || issue.context?.macroId === macroId)
  );
}

export function PatchInspector(props: PatchInspectorProps) {
  const { actions, model } = props;
  const highlightedConnectionRef = useRef<HTMLDivElement | null>(null);
  const selectedNode = model.selectedNode;
  const selectedProbe = model.selectedProbe;
  const selectedPort =
    selectedNode && isPatchOutputPortId(model.patch, selectedNode.id) ? (selectedNode as PatchPort) : null;
  const selectedSubjectKind = selectedPort ? "port" : selectedNode ? "module" : null;
  const selectedMacro = model.selectedMacroId
    ? model.patch.ui.macros.find((macro) => macro.id === model.selectedMacroId)
    : undefined;
  const selectedMacroValue = selectedMacro
    ? (model.macroValues[selectedMacro.id] ?? selectedMacro.defaultNormalized ?? 0.5)
    : undefined;
  const selectedMacroKeyframeIndex =
    selectedMacro && typeof selectedMacroValue === "number"
      ? resolveMacroKeyframeIndexAtValue(selectedMacro.keyframeCount, selectedMacroValue)
      : null;

  const visibleConnections = selectedNode
    ? model.patch.connections.filter(
        (connection) => connection.from.nodeId === selectedNode.id || connection.to.nodeId === selectedNode.id
      )
    : model.patch.connections;
  const visibleRemovedConnections = model.patchDiff.removedConnections.filter((connection) =>
    selectedNode ? connection.from.nodeId === selectedNode.id || connection.to.nodeId === selectedNode.id : true
  );
  const visibleValidationIssues = selectedNode
    ? resolveIssuesForNode(selectedNode.id, model.validationIssues)
    : model.validationIssues;
  const visibleRequiredPortIssues = resolveRequiredPortIssues(visibleValidationIssues);
  const visibleGeneralValidationIssues = visibleValidationIssues.filter(
    (issue) => issue.code !== "required-port-unconnected"
  );
  const visibleValidationHasErrors = visibleValidationIssues.some((issue) => issue.level === "error");
  const selectedMacroBindingIssues = resolveBrokenMacroBindingIssues(model.validationIssues, selectedMacro?.id);
  useEffect(() => {
    if (!model.wireCommitFeedback || !highlightedConnectionRef.current) {
      return;
    }
    highlightedConnectionRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [model.wireCommitFeedback]);
  return (
    <aside className="patch-inspector">
      <h3>Inspector</h3>
      {!selectedNode && !selectedProbe && <p className="muted">Select a module, port, or probe to edit parameters.</p>}

      {selectedNode && model.selectedSchema && (
        <>
          {selectedPort ? (
            <h4>{formatPatchPortLabel(model.patch, selectedPort)}</h4>
          ) : (
            <ModuleHeading
              node={selectedNode}
              structureLocked={model.structureLocked}
              onRenameNode={(nodeId, newNodeId) => actions.onApplyOp({ type: "renameNode", nodeId, newNodeId })}
            />
          )}
          {model.selectedSchema.params
            .filter((param) => shouldRenderParamInGenericInspector(selectedNode, param))
            .map((param) => (
              <PatchModuleParameter
                key={param.id}
                patch={model.patch}
                patchDiff={model.patchDiff}
                selectedNode={selectedNode}
                param={param}
                selectedMacroId={model.selectedMacroId}
                selectedMacroValue={selectedMacroValue}
                selectedMacroKeyframeIndex={selectedMacroKeyframeIndex}
                structureLocked={model.structureLocked}
                onApplyOp={actions.onApplyOp}
                onPreviewParamValue={actions.onPreviewParamValue}
                onExposeMacro={actions.onExposeMacro}
                onSelectMacro={actions.onSelectMacro}
                onChangeMacroValue={actions.onChangeMacroValue}
              />
            ))}
          {selectedPort && <OutputLimiterReadout preview={model.outputLimiterPreview} />}
          {selectedNode.typeId === "Compressor" && <CompressorDerivedReadouts node={selectedNode} />}
          {selectedNode.typeId === "SamplePlayer" && (
            <SamplePlayerInspectorSection
              node={selectedNode}
              structureLocked={model.structureLocked}
              onApplyOp={actions.onApplyOp}
            />
          )}
        </>
      )}

      {selectedProbe && !selectedNode && (
        <ProbeInspectorSection
          patch={model.patch}
          selectedProbe={selectedProbe}
          previewCapture={model.previewCapture}
          previewProgress={model.previewProgress}
          attachingProbeId={model.attachingProbeId}
          onUpdateProbeSpectrumWindow={actions.onUpdateProbeSpectrumWindow}
          onUpdateProbeFrequencyView={actions.onUpdateProbeFrequencyView}
          onToggleAttachProbe={actions.onToggleAttachProbe}
          onClearProbeTarget={actions.onClearProbeTarget}
        />
      )}

      {selectedMacro && selectedMacroBindingIssues.length > 0 && (
        <>
          <h4>Broken Macro Bindings</h4>
          {selectedMacroBindingIssues.map((issue) => {
            const nodeId = issue.context?.nodeId;
            const paramId = issue.context?.paramId;
            const targetLabel = `${nodeId ?? "missing"}.${paramId ?? "param"}`;
            return (
              <div key={`${selectedMacro.id}_${targetLabel}`} className="patch-macro-binding-issue">
                <p className="error">{issue.message}</p>
                {nodeId && paramId && (
                  <button
                    type="button"
                    disabled={model.structureLocked}
                    onClick={() =>
                      actions.onApplyOp({ type: "unbindMacro", macroId: selectedMacro.id, nodeId, paramId })
                    }
                  >
                    Remove {targetLabel}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {model.patchDiff.hasBaseline && !selectedNode && !selectedProbe && (
        <>
          <h4>Changes from Baseline</h4>
          {!model.patchDiff.hasChanges ? (
            <p className="ok">No changes relative to this tab&apos;s baseline patch.</p>
          ) : (
            <>
              <div className="patch-diff-summary-grid">
                {model.patchDiff.summary.addedNodeCount > 0 && (
                  <span className="patch-diff-summary-pill positive">
                    +{model.patchDiff.summary.addedNodeCount} modules
                  </span>
                )}
                {model.patchDiff.summary.modifiedNodeCount > 0 && (
                  <span className="patch-diff-summary-pill positive">
                    {model.patchDiff.summary.modifiedNodeCount} changed modules
                  </span>
                )}
                {model.patchDiff.summary.removedNodeCount > 0 && (
                  <span className="patch-diff-summary-pill negative">
                    -{model.patchDiff.summary.removedNodeCount} modules
                  </span>
                )}
                {model.patchDiff.summary.addedMacroCount > 0 && (
                  <span className="patch-diff-summary-pill positive">
                    +{model.patchDiff.summary.addedMacroCount} macros
                  </span>
                )}
                {model.patchDiff.summary.removedMacroCount > 0 && (
                  <span className="patch-diff-summary-pill negative">
                    -{model.patchDiff.summary.removedMacroCount} macros
                  </span>
                )}
                {model.patchDiff.summary.addedConnectionCount > 0 && (
                  <span className="patch-diff-summary-pill positive">
                    +{model.patchDiff.summary.addedConnectionCount} wires
                  </span>
                )}
                {model.patchDiff.summary.removedConnectionCount > 0 && (
                  <span className="patch-diff-summary-pill negative">
                    -{model.patchDiff.summary.removedConnectionCount} wires
                  </span>
                )}
              </div>

              {model.patchDiff.removedNodes.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Modules</h5>
                  <div className="patch-diff-list">
                    {model.patchDiff.removedNodes.map((node) => (
                      <div key={node.id} className="patch-diff-list-row negative removed-diff-artifact">
                        <strong>{node.typeId}</strong> <span>{node.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {model.patchDiff.removedMacros.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Macros</h5>
                  <div className="patch-diff-list">
                    {model.patchDiff.removedMacros.map((macro) => (
                      <div key={macro.id} className="patch-diff-list-row negative removed-diff-artifact">
                        <strong>{macro.name}</strong> <span>{macro.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {model.patchDiff.removedBindingDiffs.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Macro Bindings</h5>
                  <div className="patch-diff-list">
                    {model.patchDiff.removedBindingDiffs.map((bindingDiff) => (
                      <div key={bindingDiff.key} className="patch-diff-list-row negative removed-diff-artifact">
                        <strong>{bindingDiff.macroName}</strong>
                        <span>{formatPatchParamTargetLabel(model.patch, bindingDiff)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {model.patchDiff.removedConnections.length > 0 && (
                <div className="patch-diff-section">
                  <h5>Removed Wires</h5>
                  <div className="patch-diff-list">
                    {model.patchDiff.removedConnections.map((connection) => (
                      <div key={connection.id} className="patch-diff-list-row negative removed-diff-artifact">
                        <code>{connectionLabel(model.patch, connection)}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <h4>
        {selectedPort ? "Required Connections" : selectedNode ? "Required Connections" : "Unconnected Required Ports"}
      </h4>
      {visibleRequiredPortIssues.length === 0 && (
        <p className="ok">
          {selectedPort
            ? "All required port terminals are connected."
            : selectedNode
              ? "All required module ports are connected."
              : "All required ports are connected."}
        </p>
      )}
      {visibleRequiredPortIssues.map((issue, index) => {
        const label = requiredPortIssueLabel(model.patch, issue, selectedNode);
        return (
          <p key={`${issue.message}_${label.target}_${index}`} className="error">
            {label.subject}: required {label.target} is unconnected.
          </p>
        );
      })}

      <h4>{selectedPort ? "Port Connections" : selectedNode ? "Module Connections" : "Connections"}</h4>
      {visibleConnections.length === 0 && (
        <p className="muted">
          {selectedPort ? "No wires on this port." : selectedNode ? "No wires on this module." : "No wires yet."}
        </p>
      )}
      {visibleConnections.map((connection) => (
        <div
          key={connection.id}
          ref={model.wireCommitFeedback?.connectionId === connection.id ? highlightedConnectionRef : undefined}
          className={`conn-row${model.patchDiff.currentConnectionStatusById.get(connection.id) === "added" ? " diff-positive" : ""}${
            model.wireCommitFeedback?.connectionId === connection.id ? " wire-commit-highlight" : ""
          }${model.selectedConnectionId === connection.id ? " selected" : ""}`}
        >
          <code>
            <span
              className={
                model.wireCommitFeedback?.connectionId === connection.id ? "conn-endpoint-highlight" : undefined
              }
            >
              {formatPatchEndpointLabel(model.patch, connection.from)}
            </span>{" "}
            -&gt;{" "}
            <span
              className={
                model.wireCommitFeedback?.connectionId === connection.id ? "conn-endpoint-highlight" : undefined
              }
            >
              {formatPatchEndpointLabel(model.patch, connection.to)}
            </span>
          </code>
          <button
            disabled={model.structureLocked}
            onClick={() =>
              !model.structureLocked && actions.onApplyOp({ type: "disconnect", connectionId: connection.id })
            }
          >
            x
          </button>
        </div>
      ))}
      {visibleRemovedConnections.map((connection) => (
        <div key={connection.id} className="conn-row diff-negative removed-diff-artifact">
          <code>{connectionLabel(model.patch, connection)}</code>
          <button type="button" className="conn-row-status" disabled>
            removed
          </button>
        </div>
      ))}

      <h4>{selectedPort ? "Port Validation" : selectedNode ? "Module Validation" : "Validation"}</h4>
      {visibleGeneralValidationIssues.length === 0 && (
        <p className={visibleValidationHasErrors ? "error" : "ok"}>
          {visibleValidationHasErrors
            ? selectedSubjectKind
              ? `${selectedSubjectKind === "port" ? "Port" : "Module"} invalid. Fix required connections above.`
              : "Patch invalid. Fix required connections above."
            : selectedSubjectKind
              ? `${selectedSubjectKind === "port" ? "Port" : "Module"} valid.`
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
