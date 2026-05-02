import { clamp } from "@/lib/numeric";

export const COMPRESSOR_SOFT_KNEE_DB = 6;

export function compressorAutoMakeupDb(thresholdDb: number, ratio: number) {
  const safeRatio = Math.max(1, ratio);
  const reductionAtCeiling = Math.max(0, -thresholdDb) * (1 - 1 / safeRatio);
  return clamp(reductionAtCeiling * 0.4, 0, 18);
}

export function compressorGainReductionDb(inputDb: number, thresholdDb: number, ratio: number, kneeDb = COMPRESSOR_SOFT_KNEE_DB) {
  const safeRatio = Math.max(1, ratio);
  const overThresholdDb = inputDb - thresholdDb;
  const safeKneeDb = Math.max(0, kneeDb);
  const overDb =
    safeKneeDb <= 0
      ? Math.max(0, overThresholdDb)
      : overThresholdDb <= -safeKneeDb / 2
        ? 0
        : overThresholdDb >= safeKneeDb / 2
          ? overThresholdDb
          : ((overThresholdDb + safeKneeDb / 2) * (overThresholdDb + safeKneeDb / 2)) / (2 * safeKneeDb);
  return overDb * (1 - 1 / safeRatio);
}
