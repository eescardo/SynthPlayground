import { describe, expect, it } from "vitest";
import {
  VCF_FACE_NYQUIST_HZ,
  VCF_FACE_SAMPLE_RATE_HZ,
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
