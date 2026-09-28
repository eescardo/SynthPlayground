import { describe, expect, it } from "vitest";

import { resolveTrackDropTarget, trackReorderScrollSpeed } from "@/components/tracks/trackReorder";
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

  it("clamps drops beyond the tracks to the first/last insertion point", () => {
    expect(resolveTrackDropTarget({ clientY: 20, shellTop: 100, scrollTop: 0, trackLayouts })).toEqual({
      targetTrackId: "track-1",
      position: "before"
    });
    expect(resolveTrackDropTarget({ clientY: 500, shellTop: 100, scrollTop: 0, trackLayouts })).toEqual({
      targetTrackId: "track-3",
      position: "after"
    });
  });

  it("returns null for an empty canvas", () => {
    expect(resolveTrackDropTarget({ clientY: 20, shellTop: 100, scrollTop: 0, trackLayouts: [] })).toBeNull();
  });
});

describe("trackReorderScrollSpeed", () => {
  it.each([
    [50, -600],
    [100, -600],
    [132, -300],
    [164, 0],
    [300, 0],
    [436, 0],
    [468, 300],
    [500, 600],
    [550, 600]
  ])("scrolls at %s with speed %s", (y, speed) => {
    expect(trackReorderScrollSpeed(y, 100, 500)).toBe(speed);
  });
  it("handles small and empty viewports", () => {
    expect(trackReorderScrollSpeed(120, 100, 140)).toBe(0);
    expect(trackReorderScrollSpeed(120, 100, 100)).toBe(0);
  });
});
