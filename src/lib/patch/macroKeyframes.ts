import { MacroBinding, Patch, PatchMacro } from "@/types/patch";

export const clampNormalizedMacroValue = (normalized: number) => Math.max(0, Math.min(1, normalized));

export function resolveMacroBindingValue(binding: MacroBinding, normalized: number) {
  const norm = clampNormalizedMacroValue(normalized);
  if (binding.map === "piecewise" && binding.points && binding.points.length >= 2) {
    const points = binding.points;
    if (norm <= points[0].x) {
      return points[0].y;
    }
    if (norm >= points[points.length - 1].x) {
      return points[points.length - 1].y;
    }

    const segmentIndex = points.findIndex((point, index) => index > 0 && norm <= point.x);
    const right = points[segmentIndex];
    const left = points[segmentIndex - 1];
    const segmentSpan = Math.max(right.x - left.x, 0.000001);
    const segmentNorm = (norm - left.x) / segmentSpan;
    return left.y + (right.y - left.y) * segmentNorm;
  }

  if (binding.map === "exp") {
    const min = Math.max(binding.min ?? 0, 0.000001);
    const max = binding.max ?? min;
    return min * Math.pow(max / min, norm);
  }

  const min = binding.min ?? 0;
  const max = binding.max ?? 1;
  return min + (max - min) * norm;
}

export function getMacroBindingKeyframeCount(binding: MacroBinding) {
  return binding.map === "piecewise" && binding.points && binding.points.length >= 2 ? binding.points.length : 2;
}

export function normalizeMacroKeyframeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(2, Math.floor(value)) : 2;
}

export function convertBindingToKeyframeCount(binding: MacroBinding, keyframeCount: number): MacroBinding {
  const normalizedKeyframeCount = normalizeMacroKeyframeCount(keyframeCount);
  if (normalizedKeyframeCount <= 2) {
    if (getMacroBindingKeyframeCount(binding) <= 2) {
      return binding;
    }

    return {
      ...binding,
      map: "piecewise",
      points: [
        { x: 0, y: resolveMacroBindingValue(binding, 0) },
        { x: 1, y: resolveMacroBindingValue(binding, 1) }
      ]
    };
  }

  const points = Array.from({ length: normalizedKeyframeCount }, (_, index) => {
    const x = normalizedKeyframeCount === 1 ? 0 : index / (normalizedKeyframeCount - 1);
    return {
      x,
      y: resolveMacroBindingValue(binding, x)
    };
  });

  return {
    ...binding,
    map: "piecewise",
    points
  };
}

export function normalizePatchMacroDefinition(macro: PatchMacro): PatchMacro {
  const keyframeCount = Math.max(
    normalizeMacroKeyframeCount(macro.keyframeCount),
    ...macro.bindings.map(getMacroBindingKeyframeCount),
    2
  );

  return {
    ...macro,
    keyframeCount,
    bindings: macro.bindings.map((binding) => convertBindingToKeyframeCount(binding, keyframeCount))
  };
}

export function applyMacroValue(patch: Patch, macroId: string, normalized: number): Patch {
  const next = structuredClone(patch);
  const macro = next.ui.macros.find((entry) => entry.id === macroId);
  if (!macro) {
    return next;
  }

  const norm = clampNormalizedMacroValue(normalized);
  for (const binding of macro.bindings) {
    const node = next.nodes.find((entry) => entry.id === binding.nodeId);
    if (!node) {
      continue;
    }
    node.params[binding.paramId] = resolveMacroBindingValue(binding, norm);
  }

  return next;
}
