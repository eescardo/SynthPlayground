import { PatchDiffStatus } from "@/lib/patch/diff";

export function resolveDiffHighlightClass(status: PatchDiffStatus | undefined): "positive" | "negative" | null {
  if (status === "added" || status === "modified") {
    return "positive";
  }
  if (status === "removed") {
    return "negative";
  }
  return null;
}
