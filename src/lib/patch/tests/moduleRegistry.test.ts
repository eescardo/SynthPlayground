import { describe, expect, it } from "vitest";

import { getModuleSchema } from "@/lib/patch/moduleRegistry";

describe("module registry", () => {
  it("defines CVMixer4 as a four-input CV-only mixer", () => {
    const schema = getModuleSchema("CVMixer4");

    expect(schema?.portsIn.map((port) => [port.id, port.capabilities])).toEqual([
      ["in1", ["CV"]],
      ["in2", ["CV"]],
      ["in3", ["CV"]],
      ["in4", ["CV"]]
    ]);
    expect(schema?.portsOut.map((port) => [port.id, port.capabilities])).toEqual([["out", ["CV"]]]);
    expect(schema?.params.map((param) => param.id)).toEqual(["gain1", "gain2", "gain3", "gain4"]);
  });

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
    expect(schema?.params.find((param) => param.id === "attackMs")).toMatchObject({
      type: "float",
      range: { min: 10, max: 600 },
      default: 20
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

  it("exposes reverb as mode, decay, tone, and mix controls", () => {
    const schema = getModuleSchema("Reverb");

    expect(schema?.params.map((param) => param.id)).toEqual(["mode", "decay", "tone", "mix"]);
    expect(schema?.params.find((param) => param.id === "mode")).toMatchObject({
      type: "enum",
      options: ["room", "hall", "plate", "spring"],
      default: "room"
    });
    expect(schema?.params.find((param) => param.id === "decay")).toMatchObject({
      type: "float",
      unit: "ratio",
      range: { min: 0, max: 1 }
    });
    expect(schema?.params.find((param) => param.id === "tone")).toMatchObject({
      type: "float",
      unit: "ratio",
      range: { min: 0, max: 1 }
    });
    expect(schema?.params.some((param) => param.id === "size")).toBe(false);
    expect(schema?.params.some((param) => param.id === "damping")).toBe(false);
  });
});
