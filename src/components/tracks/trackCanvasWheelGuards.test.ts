import { describe, expect, it } from "vitest";
import { wheelDeltaToPixels } from "@/components/tracks/trackCanvasWheelGuards";

describe("wheelDeltaToPixels", () => {
  it.each([
    { delta: 3, mode: 0, pageSize: 400, pixels: 3 },
    { delta: 3, mode: 1, pageSize: 400, pixels: 48 },
    { delta: 3, mode: 2, pageSize: 400, pixels: 1200 }
  ])("converts wheel delta mode $mode", ({ delta, mode, pageSize, pixels }) => {
    expect(wheelDeltaToPixels(delta, mode, pageSize)).toBe(pixels);
  });
});
