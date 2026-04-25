import { MacroBinding, Patch, PatchMacro } from "@/types/patch";

export const clampNormalizedMacroValue = (normalized: number) => Math.max(0, Math.min(1, normalized));
export const MACRO_KEYFRAME_SNAP_THRESHOLD = 0.035;

export function getMacroKeyframePositions(keyframeCount: number) {
  const normalizedKeyframeCount = normalizeMacroKeyframeCount(keyframeCount);
  return Array.from({ length: normalizedKeyframeCount }, (_, index) =>
    normalizedKeyframeCount === 1 ? 0 : index / (normalizedKeyframeCount - 1)
  );
}

export function findNearestMacroKeyframeIndex(keyframeCount: number, normalized: number) {
  const positions = getMacroKeyframePositions(keyframeCount);
  const clamped = clampNormalizedMacroValue(normalized);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  positions.forEach((position, index) => {
    const distance = Math.abs(position - clamped);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function snapNormalizedToMacroKeyframe(keyframeCount: number, normalized: number, threshold = MACRO_KEYFRAME_SNAP_THRESHOLD) {
  const positions = getMacroKeyframePositions(keyframeCount);
  const clamped = clampNormalizedMacroValue(normalized);
  const nearestIndex = findNearestMacroKeyframeIndex(keyframeCount, clamped);
  return Math.abs(positions[nearestIndex] - clamped) <= threshold ? positions[nearestIndex] : clamped;
}

export function resolveMacroKeyframeIndexAtValue(
  keyframeCount: number,
  normalized: number,
  threshold = MACRO_KEYFRAME_SNAP_THRESHOLD * 0.5
) {
  const positions = getMacroKeyframePositions(keyframeCount);
  const clamped = clampNormalizedMacroValue(normalized);
  const nearestIndex = findNearestMacroKeyframeIndex(keyframeCount, clamped);
  return Math.abs(positions[nearestIndex] - clamped) <= threshold ? nearestIndex : null;
}

export function resolveMacroBindingValue(binding: MacroBinding, normalized: number) {
  const norm = clampNormalizedMacroValue(normalized);
  const interpolate = (left: number, right: number, amount: number) => {
    if (binding.map === "exp" && left > 0 && right > 0) {
      return left * Math.pow(right / left, amount);
    }
    return left + (right - left) * amount;
  };

  if (binding.points && binding.points.length >= 2) {
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
    return interpolate(left.y, right.y, segmentNorm);
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
  return binding.points && binding.points.length >= 2 ? binding.points.length : 2;
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
      map: binding.map === "piecewise" ? "linear" : binding.map,
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
    map: binding.map === "piecewise" ? "linear" : binding.map,
    points
  };
}

export function setMacroBindingValueAtKeyframe(
  binding: MacroBinding,
  keyframeCount: number,
  normalized: number,
  nextValue: number
): MacroBinding {
  const normalizedKeyframeCount = normalizeMacroKeyframeCount(keyframeCount);
  const keyframeIndex = findNearestMacroKeyframeIndex(normalizedKeyframeCount, normalized);

  if (normalizedKeyframeCount <= 2) {
    if (binding.points && binding.points.length >= 2) {
      const nextPoints = binding.points.map((point, index) => (index === keyframeIndex ? { ...point, y: nextValue } : point));
      return { ...binding, points: nextPoints };
    }

    if (keyframeIndex === 0) {
      return { ...binding, min: nextValue };
    }
    return { ...binding, max: nextValue };
  }

  const keyframedBinding = convertBindingToKeyframeCount(binding, normalizedKeyframeCount);
  const nextPoints = (keyframedBinding.points ?? []).map((point, index) => (index === keyframeIndex ? { ...point, y: nextValue } : point));
  return {
    ...keyframedBinding,
    points: nextPoints
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
