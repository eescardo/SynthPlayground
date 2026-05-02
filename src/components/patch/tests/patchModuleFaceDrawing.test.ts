import { describe, expect, it } from "vitest";
import {
  VCF_FACE_NYQUIST_HZ,
  VCF_FACE_SAMPLE_RATE_HZ,
  compressorOutputDb,
  envelopeCurveProgress,
  overdriveToneResponse,
  overdriveTransfer,
  vcfMagnitudeAtFrequency
} from "@/components/patch/patchModuleFaceDrawing";

describe("VCF module face response math", () => {
  it("uses the app sample rate and Nyquist ceiling for face calculations", () => {
    expect(VCF_FACE_SAMPLE_RATE_HZ).toBe(48000);
    expect(VCF_FACE_NYQUIST_HZ).toBe(24000);
  });

  it("shows higher resonance as a stronger lowpass cutoff peak", () => {
    const lowResonance = vcfMagnitudeAtFrequency("lowpass", 1200, 0.1, 1200);
    const highResonance = vcfMagnitudeAtFrequency("lowpass", 1200, 0.9, 1200);

    expect(highResonance).toBeGreaterThan(lowResonance);
  });

  it("reflects the high-cutoff coefficient clamp in the rendered response", () => {
    const belowClamp = vcfMagnitudeAtFrequency("lowpass", 7000, 0.8, 8500);
    const aboveClamp = vcfMagnitudeAtFrequency("lowpass", 16000, 0.8, 8500);
    const muchFurtherAboveClamp = vcfMagnitudeAtFrequency("lowpass", 20000, 0.8, 8500);

    expect(aboveClamp).toBeCloseTo(muchFurtherAboveClamp, 6);
    expect(aboveClamp).not.toBeCloseTo(belowClamp, 3);
  });
});

describe("ADSR module face curve math", () => {
  it("keeps linear curve centered between exponential and logarithmic shapes", () => {
    const midpoint = 0.5;

    expect(envelopeCurveProgress(midpoint, -1)).toBeGreaterThan(envelopeCurveProgress(midpoint, 0));
    expect(envelopeCurveProgress(midpoint, 0)).toBeCloseTo(midpoint, 6);
    expect(envelopeCurveProgress(midpoint, 1)).toBeLessThan(envelopeCurveProgress(midpoint, 0));
  });
});

describe("Compressor module face response math", () => {
  it("compresses levels above threshold while preserving levels below threshold", () => {
    expect(compressorOutputDb(-40, -24, 4, 0, 1)).toBeCloseTo(-40);
    expect(compressorOutputDb(-12, -24, 4, 0, 1)).toBeCloseTo(-21);
  });

  it("blends dry and wet response with mix", () => {
    expect(compressorOutputDb(-12, -24, 4, 0, 0.5)).toBeCloseTo(-16.5);
  });
});

describe("Overdrive module face response math", () => {
  it("renders drive zero as identity regardless of tone or mode", () => {
    expect(overdriveTransfer(0.75, 0, 0, "overdrive")).toBeCloseTo(0.75);
    expect(overdriveTransfer(0.75, 0, 1, "fuzz")).toBeCloseTo(0.75);
  });

  it("shows stronger bending as drive increases", () => {
    const input = 0.5;

    expect(overdriveTransfer(input, 36, 1, "fuzz")).toBeGreaterThan(overdriveTransfer(input, 12, 1, "fuzz"));
  });

  it("keeps low tone darker while compensating low-frequency level", () => {
    const lowFrequency = overdriveToneResponse(0, 50, 120);
    const highFrequency = overdriveToneResponse(0, 50, 8000);

    expect(lowFrequency).toBeGreaterThan(1);
    expect(highFrequency).toBeLessThan(lowFrequency);
  });
});
