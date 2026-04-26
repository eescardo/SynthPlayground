import { PatchDiffStatus } from "@/lib/patch/diff";
import { MacroBinding } from "@/types/patch";

export function resolveDiffHighlightClass(status: PatchDiffStatus | undefined): "positive" | "negative" | null {
  if (status === "added" || status === "modified") {
    return "positive";
  }
  if (status === "removed") {
    return "negative";
  }
  return null;
}

export function formatBindingValue(value: number) {
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

export function formatBindingSummary(binding: MacroBinding) {
  if (binding.points && binding.points.length >= 2) {
    return `Keyframed ${binding.points.map((point) => formatBindingValue(point.y)).join(" - ")}`;
  }
  return `Range ${formatBindingValue(binding.min ?? 0)} - ${formatBindingValue(binding.max ?? 1)}`;
}
