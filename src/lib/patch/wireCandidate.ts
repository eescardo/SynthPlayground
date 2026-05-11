import { validatePatchConnectionTarget } from "@/lib/patch/connectionValidation";
import { Patch, PatchValidationIssue, PatchWireInvalidReasonCode } from "@/types/patch";

export interface PatchWirePortRef {
  nodeId: string;
  portId: string;
  kind: "in" | "out";
}

export type PatchWireCandidate =
  | { status: "none" }
  | { status: "new-source"; port: PatchWirePortRef }
  | { status: "valid"; from: PatchWirePortRef; to: PatchWirePortRef }
  | { status: "replace"; from: PatchWirePortRef; to: PatchWirePortRef; disconnectConnectionId: string }
  | { status: "invalid"; reasonCode: PatchWireInvalidReasonCode; reason: string; target?: PatchWirePortRef };

const formatExpectedCapabilities = (capabilities?: string) => {
  if (!capabilities) {
    return "compatible signal";
  }
  return capabilities
    .split(",")
    .map((capability) => capability.trim())
    .filter(Boolean)
    .join("/");
};

const reasonForIssue = (issue?: PatchValidationIssue): { reasonCode: PatchWireInvalidReasonCode; reason: string } => {
  switch (issue?.code) {
    case "connection-capability-mismatch":
    case "connection-kind-mismatch":
      return {
        reasonCode: "type-mismatch",
        reason: `Type mismatch: ${formatExpectedCapabilities(issue.context?.to)} expected`
      };
    case "connection-cycle":
      return { reasonCode: "would-create-cycle", reason: "Would create cycle" };
    case "connection-target-occupied":
      return { reasonCode: "target-occupied", reason: "target occupied" };
    default:
      return { reasonCode: "invalid-target", reason: "invalid target" };
  }
};

export function resolvePatchWireCandidate(
  patch: Patch,
  startPort: PatchWirePortRef | null,
  targetPort: PatchWirePortRef | null,
  options: { structureLocked?: boolean } = {}
): PatchWireCandidate {
  if (!startPort || !targetPort) {
    return { status: "none" };
  }
  if (options.structureLocked) {
    return {
      status: "invalid",
      reasonCode: "preset-structure-locked",
      reason: "Preset structure is locked",
      target: targetPort
    };
  }
  if (startPort.kind === targetPort.kind) {
    return { status: "new-source", port: targetPort };
  }

  const from = startPort.kind === "out" ? startPort : targetPort;
  const to = startPort.kind === "in" ? startPort : targetPort;
  const issues = validatePatchConnectionTarget(patch, {
    fromNodeId: from.nodeId,
    fromPortId: from.portId,
    toNodeId: to.nodeId,
    toPortId: to.portId
  });
  const error = issues.find((issue) => issue.level === "error");
  if (!error) {
    return { status: "valid", from, to };
  }

  if (error.code !== "connection-target-occupied") {
    return { status: "invalid", ...reasonForIssue(error), target: targetPort };
  }

  const occupiedConnection = patch.connections.find(
    (connection) => connection.to.nodeId === to.nodeId && connection.to.portId === to.portId
  );
  if (!occupiedConnection) {
    return { status: "invalid", reasonCode: "target-occupied", reason: "target occupied", target: targetPort };
  }
  if (
    occupiedConnection.from.nodeId === from.nodeId &&
    occupiedConnection.from.portId === from.portId &&
    occupiedConnection.to.nodeId === to.nodeId &&
    occupiedConnection.to.portId === to.portId
  ) {
    return { status: "invalid", reasonCode: "already-connected", reason: "already connected", target: targetPort };
  }

  const replacementIssues = validatePatchConnectionTarget(patch, {
    fromNodeId: from.nodeId,
    fromPortId: from.portId,
    toNodeId: to.nodeId,
    toPortId: to.portId,
    replaceConnectionId: occupiedConnection.id
  });
  const replacementError = replacementIssues.find((issue) => issue.level === "error");
  if (replacementError) {
    return { status: "invalid", ...reasonForIssue(replacementError), target: targetPort };
  }

  return { status: "replace", from, to, disconnectConnectionId: occupiedConnection.id };
}
