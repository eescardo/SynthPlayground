import { describe, expect, it } from "vitest";

import {
  COMPRESSOR_SOFT_KNEE_DB,
  compressorDerivedParamsForSquash,
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

function bassLikeSample(index: number) {
  const time = index / SAMPLE_RATE;
  const noteTime = time % 2.8;
  const amplitude =
    noteTime < 0.015
      ? 0.45 * (noteTime / 0.015)
      : noteTime < 0.36
        ? 0.45
        : 0.45 * Math.exp(-(noteTime - 0.36) * 1.55);
  const saw = 2 * ((time * 110) % 1) - 1;
  const triangle = 2 * Math.abs(2 * ((time * 110.55) % 1) - 1) - 1;
  return amplitude * (saw * 0.65 + triangle * 0.35);
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

function envelopeShape(samples: Float32Array) {
  const bodyDb = analyzeWindowRms(samples, 0.08, 0.35);
  const tailDb = analyzeWindowRms(samples, 1.2, 2.0);
  return { bodyDb, tailDb, tailRelativeToBodyDb: tailDb - bodyDb };
}

function analyzeWindowRms(samples: Float32Array, startSeconds: number, endSeconds: number) {
  const start = Math.floor(startSeconds * SAMPLE_RATE);
  const end = Math.min(samples.length, Math.floor(endSeconds * SAMPLE_RATE));
  let squareSum = 0;
  for (let index = start; index < end; index += 1) {
    squareSum += samples[index] * samples[index];
  }
  return 20 * Math.log10(Math.sqrt(squareSum / Math.max(1, end - start)) + 1e-9);
}

function simulateCompressor(params: { squash: number; attackMs: number; mix: number; material?: "pluck" | "bass" }) {
  const frameCount = SAMPLE_RATE * DURATION_SECONDS;
  const input = new Float32Array(frameCount);
  const output = new Float32Array(frameCount);
  const derived = compressorDerivedParamsForSquash(params.squash);
  let rmsEnergy = 0;
  let envelope = 0;
  let gainReductionDb = 0;

  for (let index = 0; index < frameCount; index += 1) {
    const sample = params.material === "bass" ? bassLikeSample(index) : pluckLikeSample(index);
    input[index] = sample;

    rmsEnergy = onePoleStep(rmsEnergy, sample * sample, smoothingAlpha(8));
    const rmsInput = Math.sqrt(Math.max(0, rmsEnergy));
    envelope =
      rmsInput > envelope
        ? onePoleStep(envelope, rmsInput, smoothingAlpha(params.attackMs))
        : onePoleStep(envelope, rmsInput, smoothingAlpha(derived.releaseMs));
    const levelDb = 20 * Math.log10(Math.max(envelope, 0.00001));
    const targetReductionDb = compressorGainReductionDb(levelDb, derived.thresholdDb, derived.ratio, COMPRESSOR_SOFT_KNEE_DB);
    const gainAlpha =
      targetReductionDb > gainReductionDb
        ? smoothingAlpha(Math.max(8, params.attackMs) * 0.35)
        : smoothingAlpha(35);
    gainReductionDb = onePoleStep(gainReductionDb, targetReductionDb, gainAlpha);
    const wet = sample * dbToGain(derived.autoGainDb - gainReductionDb);
    output[index] = sample * (1 - params.mix) + wet * params.mix;
  }

  const inputLevel = analyzeLevel(input);
  const outputLevel = analyzeLevel(output);
  const inputEnvelope = envelopeShape(input);
  const outputEnvelope = envelopeShape(output);
  return {
    rmsDeltaDb: outputLevel.rmsDb - inputLevel.rmsDb,
    p90DeltaDb: outputLevel.p90WindowRmsDb - inputLevel.p90WindowRmsDb,
    bodyDeltaDb: outputEnvelope.bodyDb - inputEnvelope.bodyDb,
    tailDeltaDb: outputEnvelope.tailDb - inputEnvelope.tailDb,
    sustainLiftDb: outputEnvelope.tailRelativeToBodyDb - inputEnvelope.tailRelativeToBodyDb
  };
}

describe("compressor defaults", () => {
  it("does not change level at zero squash", () => {
    for (const attackMs of [10, 200]) {
      for (const material of ["pluck", "bass"] as const) {
        const result = simulateCompressor({ squash: 0, attackMs, mix: 1, material });
        expect(Math.abs(result.rmsDeltaDb)).toBeLessThan(0.05);
        expect(Math.abs(result.p90DeltaDb)).toBeLessThan(0.05);
      }
    }
  });

  it("keeps compressed material from getting much louder at squash anchors", () => {
    for (const squash of [0.25, 0.5, 1]) {
      for (const material of ["pluck", "bass"] as const) {
        const result = simulateCompressor({ squash, attackMs: 20, mix: 0.55, material });
        expect(result.rmsDeltaDb).toBeLessThan(4.5);
        expect(result.p90DeltaDb).toBeLessThan(4.5);
      }
    }
  });

  it("keeps bass tails more sustained at stronger squash", () => {
    const medium = simulateCompressor({ squash: 0.5, attackMs: 20, mix: 0.55, material: "bass" });
    const high = simulateCompressor({ squash: 1, attackMs: 20, mix: 0.55, material: "bass" });

    expect(high.rmsDeltaDb).toBeGreaterThan(-2);
    expect(high.tailDeltaDb).toBeGreaterThan(4);
    expect(medium.sustainLiftDb).toBeGreaterThan(2);
    expect(high.sustainLiftDb).toBeGreaterThan(3);
  });
});
