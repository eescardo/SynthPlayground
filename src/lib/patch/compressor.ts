import { clamp } from "@/lib/numeric";

export const COMPRESSOR_SOFT_KNEE_DB = 12;

export interface CompressorDerivedParams {
  thresholdDb: number;
  ratio: number;
  autoGainDb: number;
  releaseMs: number;
}

export function compressorDerivedParamsForSquash(squash: number, attackMs = 20): CompressorDerivedParams {
  const amount = clamp(squash, 0, 1);
  const attackRatio = Math.log(clamp(attackMs, 10, 600) / 10) / Math.log(60);
  return {
    thresholdDb: -5 - 33 * Math.pow(amount, 1.08),
    ratio: 1 + 11 * Math.pow(amount, 1.45),
    autoGainDb: amount * (18 + 8 * (1 - Math.pow(attackRatio, 0.8))),
    releaseMs: 260 - 150 * Math.pow(amount, 0.75)
  };
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
