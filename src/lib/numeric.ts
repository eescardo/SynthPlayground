export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, min, max);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clampBipolar(value: number): number {
  return clamp(value, -1, 1);
}

export function clampRange(min: number, max: number): { min: number; max: number } {
  return { min: Math.min(min, max), max: Math.max(min, max) };
}
