import { validatePatchConnectionCandidate } from "@/lib/patch/validation";
import { PatchOp } from "@/types/ops";
import { Patch, PatchValidationIssue } from "@/types/patch";

export interface PatchConnectionValidationTarget {
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
  replaceConnectionId?: string;
}

export function resolvePatchForConnectionValidation(patch: Patch, target: PatchConnectionValidationTarget) {
  if (!target.replaceConnectionId) {
    return patch;
  }
  return {
    ...patch,
    connections: patch.connections.filter((connection) => connection.id !== target.replaceConnectionId)
  };
}

export function validatePatchConnectionTarget(
  patch: Patch,
  target: PatchConnectionValidationTarget
): PatchValidationIssue[] {
  const validationPatch = resolvePatchForConnectionValidation(patch, target);
  return validatePatchConnectionCandidate(
    validationPatch,
    target.fromNodeId,
    target.fromPortId,
    target.toNodeId,
    target.toPortId
  );
}

export function validatePatchConnectionOp(
  patch: Patch,
  op: Extract<PatchOp, { type: "connect" | "replaceConnection" }>
) {
  return validatePatchConnectionTarget(patch, {
    fromNodeId: op.fromNodeId,
    fromPortId: op.fromPortId,
    toNodeId: op.toNodeId,
    toPortId: op.toPortId,
    replaceConnectionId: op.type === "replaceConnection" ? op.disconnectConnectionId : undefined
  });
}
