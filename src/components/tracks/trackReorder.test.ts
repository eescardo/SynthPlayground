import { describe, expect, it } from "vitest";

import { resolveTrackDropTarget } from "@/components/tracks/trackReorder";
import type { TrackLayout } from "@/components/tracks/trackCanvasTypes";

const layout = (trackId: string, y: number, height = 72): TrackLayout => ({
  trackId,
  index: Number(trackId.slice(-1)),
  y,
  height,
  automationLanes: []
});

describe("resolveTrackDropTarget", () => {
  const trackLayouts = [layout("track-1", 28), layout("track-2", 100), layout("track-3", 172, 180)];

  it.each([
    { clientY: 138, expected: { targetTrackId: "track-1", position: "before" } },
    { clientY: 170, expected: { targetTrackId: "track-1", position: "after" } },
    { clientY: 300, expected: { targetTrackId: "track-3", position: "before" } },
    { clientY: 400, expected: { targetTrackId: "track-3", position: "after" } }
  ])("resolves $expected.position placement from client coordinate $clientY", ({ clientY, expected }) => {
    expect(resolveTrackDropTarget({ clientY, shellTop: 100, scrollTop: 0, trackLayouts })).toEqual(expected);
  });

  it("accounts for vertical canvas scrolling", () => {
    expect(resolveTrackDropTarget({ clientY: 150, shellTop: 100, scrollTop: 240, trackLayouts })).toEqual({
      targetTrackId: "track-3",
      position: "after"
    });
  });

  it("returns null outside every track layout", () => {
    expect(resolveTrackDropTarget({ clientY: 110, shellTop: 100, scrollTop: 0, trackLayouts })).toBeNull();
    expect(resolveTrackDropTarget({ clientY: 500, shellTop: 100, scrollTop: 0, trackLayouts })).toBeNull();
  });
});
