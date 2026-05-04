import { describe, expect, it } from "vitest";

import {
  COMPRESSOR_SOFT_KNEE_DB,
  compressorAdaptiveAttackBufferMs,
  compressorAutoMakeupDb,
  compressorGainReductionDb
} from "@/lib/patch/compressor";

const SAMPLE_RATE = 48_000;
const DURATION_SECONDS = 12;
const ANALYSIS_START = SAMPLE_RATE;
const WINDOW_SIZE = 2_400;

function smoothingAlpha(timeMs: number) {
  const tauSamples = Math.max(1, (timeMs / 1000) * SAMPLE_RATE);
  return Math.exp(-1 / tauSamples);
}

function onePoleStep(current: number, target: number, alpha: number) {
  return current + (target - current) * (1 - alpha);
}

function dbToGain(db: number) {
  return 10 ** (db / 20);
}

function pluckLikeSample(index: number) {
  const time = index / SAMPLE_RATE;
  const noteIndex = Math.floor(time * 2);
  const noteTime = time * 2 - noteIndex;
  const amplitude = (0.18 + 0.08 * ((noteIndex * 7) % 5)) * Math.exp(-noteTime * 5.2);
  const frequency = 220 * 2 ** ((noteIndex % 8) / 12);
  const saw = 2 * ((time * frequency) % 1) - 1;
  const triangle = 2 * Math.abs(2 * ((time * frequency * 1.01) % 1) - 1) - 1;
  return amplitude * (saw * 0.7 + triangle * 0.3) + 0.002 * Math.sin(2 * Math.PI * 37 * time);
}

function analyzeLevel(samples: Float32Array) {
  let squareSum = 0;
  const windowRmsDb: number[] = [];

  for (let index = ANALYSIS_START; index < samples.length; index += 1) {
    squareSum += samples[index] * samples[index];
  }

  for (let start = ANALYSIS_START; start < samples.length; start += WINDOW_SIZE) {
    let windowSquareSum = 0;
    let count = 0;
    for (let index = start; index < Math.min(samples.length, start + WINDOW_SIZE); index += 1) {
      windowSquareSum += samples[index] * samples[index];
      count += 1;
    }
    windowRmsDb.push(20 * Math.log10(Math.sqrt(windowSquareSum / Math.max(1, count)) + 1e-9));
  }

  windowRmsDb.sort((left, right) => left - right);
  return {
    rmsDb: 20 * Math.log10(Math.sqrt(squareSum / (samples.length - ANALYSIS_START)) + 1e-9),
    p90WindowRmsDb: windowRmsDb[Math.floor(windowRmsDb.length * 0.9)] ?? -120
  };
}

function simulateCompressor(params: { thresholdDb: number; ratio: number; attackMs: number }) {
  const frameCount = SAMPLE_RATE * DURATION_SECONDS;
  const input = new Float32Array(frameCount);
  const output = new Float32Array(frameCount);
  const makeupDb = compressorAutoMakeupDb(params.thresholdDb, params.ratio);
  const effectiveAttackMs = params.attackMs + compressorAdaptiveAttackBufferMs(params.thresholdDb, params.ratio);
  let rmsEnergy = 0;
  let envelope = 0;
  let gainReductionDb = 0;

  for (let index = 0; index < frameCount; index += 1) {
    const sample = pluckLikeSample(index);
    input[index] = sample;

    rmsEnergy = onePoleStep(rmsEnergy, sample * sample, smoothingAlpha(8));
    const rmsInput = Math.sqrt(Math.max(0, rmsEnergy));
    envelope =
      rmsInput > envelope
        ? onePoleStep(envelope, rmsInput, smoothingAlpha(effectiveAttackMs))
        : onePoleStep(envelope, rmsInput, smoothingAlpha(200));
    const levelDb = 20 * Math.log10(Math.max(envelope, 0.00001));
    const targetReductionDb = compressorGainReductionDb(levelDb, params.thresholdDb, params.ratio, COMPRESSOR_SOFT_KNEE_DB);
    const gainAlpha =
      targetReductionDb > gainReductionDb
        ? smoothingAlpha(Math.max(8, effectiveAttackMs) * 0.35)
        : smoothingAlpha(35);
    gainReductionDb = onePoleStep(gainReductionDb, targetReductionDb, gainAlpha);
    output[index] = sample * dbToGain(makeupDb - gainReductionDb);
  }

  const inputLevel = analyzeLevel(input);
  const outputLevel = analyzeLevel(output);
  return {
    rmsDeltaDb: outputLevel.rmsDb - inputLevel.rmsDb,
    p90DeltaDb: outputLevel.p90WindowRmsDb - inputLevel.p90WindowRmsDb
  };
}

describe("compressor defaults", () => {
  it("does not change level at ratio 1 regardless of threshold", () => {
    for (const thresholdDb of [-24, -60]) {
      for (const attackMs of [10, 200]) {
        const result = simulateCompressor({ thresholdDb, ratio: 1, attackMs });
        expect(Math.abs(result.rmsDeltaDb)).toBeLessThan(0.05);
        expect(Math.abs(result.p90DeltaDb)).toBeLessThan(0.05);
      }
    }
  });

  it("keeps auto-compensated pluck material from getting louder at compression anchors", () => {
    for (const thresholdDb of [-24, -45, -60]) {
      for (const ratio of [2, 20]) {
        for (const attackMs of [10, 200]) {
          const result = simulateCompressor({ thresholdDb, ratio, attackMs });
          expect(result.rmsDeltaDb).toBeLessThan(3.5);
          expect(result.p90DeltaDb).toBeLessThan(3.5);
        }
      }
    }
  });
});
