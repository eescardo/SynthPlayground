import { describe, expect, it } from "vitest";

import { getModuleSchema } from "@/lib/patch/moduleRegistry";

describe("module registry", () => {
  it("defines CVTranspose pitch offsets as integer-stepped controls", () => {
    const schema = getModuleSchema("CVTranspose");

    expect(schema).toBeDefined();

    const octaves = schema?.params.find((param) => param.id === "octaves");
    const semitones = schema?.params.find((param) => param.id === "semitones");
    const cents = schema?.params.find((param) => param.id === "cents");

    expect(octaves).toMatchObject({
      type: "float",
      range: { min: -4, max: 4 },
      step: 1
    });
    expect(semitones).toMatchObject({
      type: "float",
      range: { min: -11, max: 11 },
      step: 1
    });
    expect(cents).toMatchObject({
      type: "float",
      range: { min: -100, max: 100 },
      step: 1
    });
  });

  it("exposes compressor as squash, attack, and mix controls", () => {
    const schema = getModuleSchema("Compressor");

    expect(schema?.params.map((param) => param.id)).toEqual(["squash", "attackMs", "mix"]);
    expect(schema?.params.find((param) => param.id === "squash")).toMatchObject({
      type: "float",
      range: { min: 0, max: 1 },
      default: 0.5
    });
    expect(schema?.params.find((param) => param.id === "mix")).toMatchObject({
      type: "float",
      default: 0.55
    });
    expect(schema?.params.some((param) => param.id === "thresholdDb")).toBe(false);
    expect(schema?.params.some((param) => param.id === "ratio")).toBe(false);
    expect(schema?.params.some((param) => param.id === "releaseMs")).toBe(false);
    expect(schema?.params.some((param) => param.id === "makeupDb")).toBe(false);
    expect(schema?.params.some((param) => param.id === "autoMakeup")).toBe(false);
  });
});
