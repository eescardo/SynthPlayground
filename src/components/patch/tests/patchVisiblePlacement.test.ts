import { describe, expect, it } from "vitest";
import {
  resolveVisibleAddModulePosition,
  resolveVisibleAddProbePosition
} from "@/components/patch/patchVisiblePlacement";

describe("resolveVisibleAddModulePosition", () => {
  it("places new modules inside the current visible viewport", () => {
    expect(resolveVisibleAddModulePosition([], { left: 720, top: 240, width: 480, height: 360 }, 1)).toEqual({
      x: 31,
      y: 11
    });
  });

  it("chooses the first empty visible spot that does not overlap existing modules", () => {
    expect(resolveVisibleAddModulePosition([{ x: 1, y: 1 }], { left: 0, top: 0, width: 720, height: 480 }, 1)).toEqual({
      x: 10,
      y: 1
    });
  });

  it("falls back to the visible top-left when the visible region is full", () => {
    const occupied = Array.from({ length: 8 }, (_, index) => ({ x: 1 + index * 9, y: 1 }));
    expect(resolveVisibleAddModulePosition(occupied, { left: 0, top: 0, width: 180, height: 120 }, 1)).toEqual({
      x: 1,
      y: 1
    });
  });

  it("places probes inside the current visible viewport", () => {
    expect(
      resolveVisibleAddProbePosition([], [], "scope", { left: 720, top: 240, width: 480, height: 360 }, 1)
    ).toEqual({
      x: 31,
      y: 11
    });
  });

  it("chooses an empty visible probe spot away from modules and probes", () => {
    expect(
      resolveVisibleAddProbePosition(
        [{ x: 10, y: 1, width: 10, height: 6 }],
        [{ x: 1, y: 1 }],
        "scope",
        { left: 0, top: 0, width: 960, height: 480 },
        1
      )
    ).toEqual({
      x: 20,
      y: 1
    });
  });
});
