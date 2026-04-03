import { describe, expect, it } from "vitest";
import { getHoverTarget } from "@/components/trackCanvasGeometry";

describe("getHoverTarget", () => {
  it("keeps track notes above playhead and loop markers when they overlap", () => {
    expect(
      getHoverTarget({
        hasMuteHit: false,
        hasPitchHit: false,
        hasLoopMarkerHit: true,
        hasPlayheadHit: true,
        noteRect: { x: 240, w: 72 }
      })
    ).toBe("note");
  });

  it("keeps pitch labels above the rest of the note hit area", () => {
    expect(
      getHoverTarget({
        hasMuteHit: false,
        hasPitchHit: true,
        hasLoopMarkerHit: true,
        hasPlayheadHit: true,
        noteRect: { x: 240, w: 72 }
      })
    ).toBe("pitch");
  });

  it("falls back to playhead when there is no note under the pointer", () => {
    expect(
      getHoverTarget({
        hasMuteHit: false,
        hasPitchHit: false,
        hasLoopMarkerHit: false,
        hasPlayheadHit: true,
        noteRect: null
      })
    ).toBe("playhead");
  });
});
