import { describe, expect, it } from "vitest";
import { clamp, clamp01, clampBipolar, clampFinite, clampRange } from "@/lib/numeric";

describe("numeric helpers", () => {
  it("clamps values into arbitrary ranges", () => {
    expect(clamp(-1, 2, 5)).toBe(2);
    expect(clamp(3, 2, 5)).toBe(3);
    expect(clamp(6, 2, 5)).toBe(5);
  });

  it("clamps normalized and bipolar ranges", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(1.2)).toBe(1);
    expect(clampBipolar(-1.5)).toBe(-1);
    expect(clampBipolar(0.5)).toBe(0.5);
    expect(clampBipolar(1.5)).toBe(1);
  });

  it("clamps finite numeric inputs with a fallback", () => {
    expect(clampFinite(12, 4, 0, 10)).toBe(10);
    expect(clampFinite(Number.NaN, 4, 0, 10)).toBe(4);
    expect(clampFinite("12", 4, 0, 10)).toBe(4);
  });

  it("normalizes unordered ranges", () => {
    expect(clampRange(5, 2)).toEqual({ min: 2, max: 5 });
    expect(clampRange(2, 5)).toEqual({ min: 2, max: 5 });
  });
});
