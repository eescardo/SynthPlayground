import { validatePatchConnectionCandidate } from "@/lib/patch/validation";
import { Patch, PatchValidationIssue } from "@/types/patch";

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
  | { status: "invalid"; reason: string; target?: PatchWirePortRef };

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

const reasonForIssue = (issue?: PatchValidationIssue) => {
  switch (issue?.code) {
    case "connection-capability-mismatch":
    case "connection-kind-mismatch":
      return `Type mismatch: ${formatExpectedCapabilities(issue.context?.to)} expected`;
    case "connection-cycle":
      return "Would create cycle";
    case "connection-target-occupied":
      return "target occupied";
    default:
      return "invalid target";
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
    return { status: "invalid", reason: "Preset structure is locked", target: targetPort };
  }
  if (startPort.kind === targetPort.kind) {
    return { status: "new-source", port: targetPort };
  }

  const from = startPort.kind === "out" ? startPort : targetPort;
  const to = startPort.kind === "in" ? startPort : targetPort;
  const issues = validatePatchConnectionCandidate(patch, from.nodeId, from.portId, to.nodeId, to.portId);
  const error = issues.find((issue) => issue.level === "error");
  if (!error) {
    return { status: "valid", from, to };
  }

  if (error.code !== "connection-target-occupied") {
    return { status: "invalid", reason: reasonForIssue(error), target: targetPort };
  }

  const occupiedConnection = patch.connections.find(
    (connection) => connection.to.nodeId === to.nodeId && connection.to.portId === to.portId
  );
  if (!occupiedConnection) {
    return { status: "invalid", reason: "target occupied", target: targetPort };
  }

  const replacementPatch = {
    ...patch,
    connections: patch.connections.filter((connection) => connection.id !== occupiedConnection.id)
  };
  const replacementIssues = validatePatchConnectionCandidate(
    replacementPatch,
    from.nodeId,
    from.portId,
    to.nodeId,
    to.portId
  );
  const replacementError = replacementIssues.find((issue) => issue.level === "error");
  if (replacementError) {
    return { status: "invalid", reason: reasonForIssue(replacementError), target: targetPort };
  }

  return { status: "replace", from, to, disconnectConnectionId: occupiedConnection.id };
}
