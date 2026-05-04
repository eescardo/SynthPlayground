import {
  resolveMacroKeyframeIndexAtValue
} from "@/lib/patch/macroKeyframes";
import { PatchDiff } from "@/lib/patch/diff";
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
import { compressorAutoMakeupDb } from "@/lib/patch/compressor";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch, PatchNode, PatchPort, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

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

function CompressorAutoGainReadout({ node }: { node: PatchNode }) {
  const autoGainDb = compressorAutoMakeupDb(Number(node.params.thresholdDb ?? -24), Number(node.params.ratio ?? 4));
  return (
    <div className="param-row">
      <div className="param-row-header">
        <span className="param-name">Auto Gain</span>
        <span className="param-current-value-shell">
          <span className="param-current-value-label">{autoGainDb.toFixed(1)}</span>
          <span className="param-current-value-unit">dB</span>
        </span>
      </div>
    </div>
  );
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
  onPreviewParamValue?: (nodeId: string, paramId: string, value: PatchNode["params"][string]) => void;
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

function resolveBrokenMacroBindingIssues(issues: PatchValidationIssue[], macroId?: string) {
  return issues.filter(
    (issue) =>
      (issue.code === "macro-binding-missing-node" || issue.code === "macro-binding-invalid-param") &&
      (!macroId || issue.context?.macroId === macroId)
  );
}

export function PatchInspector(props: PatchInspectorProps) {
  const selectedNode = props.selectedNode;
  const selectedProbe = props.selectedProbe;
  const selectedPort = selectedNode && isPatchOutputPortId(props.patch, selectedNode.id) ? (selectedNode as PatchPort) : null;
  const selectedSubjectKind = selectedPort ? "port" : selectedNode ? "module" : null;
  const selectedMacro = props.selectedMacroId
    ? props.patch.ui.macros.find((macro) => macro.id === props.selectedMacroId)
    : undefined;
  const selectedMacroValue =
    selectedMacro ? (props.macroValues[selectedMacro.id] ?? selectedMacro.defaultNormalized ?? 0.5) : undefined;
  const selectedMacroKeyframeIndex =
    selectedMacro && typeof selectedMacroValue === "number"
      ? resolveMacroKeyframeIndexAtValue(selectedMacro.keyframeCount, selectedMacroValue)
      : null;

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
  const selectedMacroBindingIssues = resolveBrokenMacroBindingIssues(props.validationIssues, selectedMacro?.id);
  return (
    <aside className="patch-inspector">
      <h3>Inspector</h3>
      {!selectedNode && !selectedProbe && <p className="muted">Select a module, port, or probe to edit parameters.</p>}

      {selectedNode && props.selectedSchema && (
        <>
          <h4>{selectedPort ? formatPatchPortLabel(props.patch, selectedPort) : <>{selectedNode.typeId} <small>{selectedNode.id}</small></>}</h4>
          {props.selectedSchema.params
            .filter((param) => shouldRenderParamInGenericInspector(selectedNode, param))
            .map((param) => (
              <PatchModuleParameter
                key={param.id}
                patch={props.patch}
                patchDiff={props.patchDiff}
                selectedNode={selectedNode}
                param={param}
                selectedMacroId={props.selectedMacroId}
                selectedMacroValue={selectedMacroValue}
                selectedMacroKeyframeIndex={selectedMacroKeyframeIndex}
                structureLocked={props.structureLocked}
                onApplyOp={props.onApplyOp}
                onPreviewParamValue={props.onPreviewParamValue}
                onExposeMacro={props.onExposeMacro}
              />
            ))}
          {selectedNode.typeId === "Compressor" && <CompressorAutoGainReadout node={selectedNode} />}
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

      {selectedMacro && selectedMacroBindingIssues.length > 0 && (
        <>
          <h4>Broken Macro Bindings</h4>
          {selectedMacroBindingIssues.map((issue) => {
            const bindingId = issue.context?.bindingId;
            const targetLabel = `${issue.context?.nodeId ?? "missing"}.${issue.context?.paramId ?? "param"}`;
            return (
              <div key={`${selectedMacro.id}_${bindingId ?? targetLabel}`} className="patch-macro-binding-issue">
                <p className="error">{issue.message}</p>
                {bindingId && (
                  <button
                    type="button"
                    disabled={props.structureLocked}
                    onClick={() => props.onApplyOp({ type: "unbindMacro", macroId: selectedMacro.id, bindingId })}
                  >
                    Remove {targetLabel}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {props.patchDiff.hasBaseline && !selectedNode && !selectedProbe && (
        <>
          <h4>Changes from Baseline</h4>
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
                        <strong>{bindingDiff.macroName}</strong>
                        <span>{formatPatchParamTargetLabel(props.patch, bindingDiff)}</span>
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
                        <code>{connectionLabel(props.patch, connection)}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <h4>{selectedPort ? "Required Connections" : selectedNode ? "Required Connections" : "Unconnected Required Ports"}</h4>
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
        const label = requiredPortIssueLabel(props.patch, issue, selectedNode);
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
          className={`conn-row${props.patchDiff.currentConnectionStatusById.get(connection.id) === "added" ? " diff-positive" : ""}`}
        >
          <code>
            {connectionLabel(props.patch, connection)}
          </code>
          <button disabled={props.structureLocked} onClick={() => !props.structureLocked && props.onApplyOp({ type: "disconnect", connectionId: connection.id })}>x</button>
        </div>
      ))}
      {visibleRemovedConnections.map((connection) => (
        <div key={connection.id} className="conn-row diff-negative removed-diff-artifact">
          <code>{connectionLabel(props.patch, connection)}</code>
          <button type="button" disabled>
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
