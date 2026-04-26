import {
  resolveMacroKeyframeIndexAtValue
} from "@/lib/patch/macroKeyframes";
import { PatchDiff } from "@/lib/patch/diff";
import { PatchModuleParameter, shouldRenderParamInGenericInspector } from "@/components/patch/PatchModuleParameter";
import { SamplePlayerInspectorSection } from "@/components/patch/SamplePlayerInspectorSection";
import { ProbeInspectorSection } from "@/components/patch/ProbeInspectorSection";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch, PatchNode, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

function connectionLabel(connection: Pick<Patch["connections"][number], "from" | "to">) {
  return `${connection.from.nodeId}.${connection.from.portId} -> ${connection.to.nodeId}.${connection.to.portId}`;
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
                onExposeMacro={props.onExposeMacro}
              />
            ))}
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
