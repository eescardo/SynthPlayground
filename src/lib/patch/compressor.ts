import { clamp } from "@/lib/numeric";

export function compressorAutoMakeupDb(thresholdDb: number, ratio: number) {
  const safeRatio = Math.max(1, ratio);
  const reductionAtCeiling = Math.max(0, -thresholdDb) * (1 - 1 / safeRatio);
  return clamp(reductionAtCeiling * 0.5, 0, 24);
}
