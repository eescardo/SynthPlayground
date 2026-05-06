import { clamp } from "@/lib/numeric";

export const COMPRESSOR_SOFT_KNEE_DB = 12;

export interface CompressorDerivedParams {
  thresholdDb: number;
  ratio: number;
  autoGainDb: number;
  releaseMs: number;
}

export function compressorDerivedParamsForSquash(squash: number): CompressorDerivedParams {
  const amount = clamp(squash, 0, 1);
  return {
    thresholdDb: -4 - 38 * Math.pow(amount, 1.12),
    ratio: 1 + 11 * Math.pow(amount, 1.45),
    autoGainDb: 9.5 * (1 - Math.exp(-2.4 * amount)),
    releaseMs: 220 - 160 * Math.pow(amount, 0.8)
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
