import { describe, expect, it } from "vitest";

import { createDefaultParamsForType, getModuleSchema } from "@/lib/patch/moduleRegistry";

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

  it("enables compressor auto makeup by default", () => {
    expect(createDefaultParamsForType("Compressor").autoMakeup).toBe(true);
  });
});
