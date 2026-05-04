import { clamp } from "@/lib/numeric";

export const COMPRESSOR_SOFT_KNEE_DB = 12;

export function compressorAutoMakeupDb(thresholdDb: number, ratio: number) {
  const safeRatio = Math.max(1, ratio);
  const reductionAtCeiling = Math.max(0, -thresholdDb) * (1 - 1 / safeRatio);
  return clamp(reductionAtCeiling * 0.4, 0, 18);
}

export function compressorAdaptiveAttackBufferMs(thresholdDb: number, ratio: number) {
  const safeRatio = Math.max(1, ratio);
  const reductionAtCeiling = Math.max(0, -thresholdDb) * (1 - 1 / safeRatio);
  const activeReduction = Math.max(0, reductionAtCeiling - 6);
  return clamp(Math.pow(activeReduction / 24, 1.1) * 160, 0, 360);
}

export function compressorEffectiveAttackMs(attackMs: number, thresholdDb: number, ratio: number) {
  return attackMs + compressorAdaptiveAttackBufferMs(thresholdDb, ratio);
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
