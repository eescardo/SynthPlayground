import { PatchValidationIssue } from "@/types/patch";

export function resolveInvalidPortKeys(validationIssues: PatchValidationIssue[]) {
  const invalidPortKeys = new Set<string>();
  for (const issue of validationIssues) {
    if (issue.code !== "required-port-unconnected") {
      continue;
    }
    const nodeId = issue.context?.nodeId;
    const portId = issue.context?.portId;
    const direction = issue.context?.direction;
    if (!nodeId || !portId || (direction !== "in" && direction !== "out")) {
      continue;
    }
    invalidPortKeys.add(`${nodeId}:${direction}:${portId}`);
  }
  return invalidPortKeys;
}
