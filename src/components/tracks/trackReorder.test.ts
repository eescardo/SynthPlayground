import { describe, expect, it } from "vitest";

import {
  resolveFocusedHandleScrollTop,
  resolveTrackDropTarget,
  resolveTrackReorderKeyDirection,
  shouldPropagateTrackReorderKeyDown,
  trackReorderScrollSpeed
} from "@/components/tracks/trackReorder";
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
    expect(resolveTrackDropTarget({ clientY, shellTop: 100, shellBottom: 500, scrollTop: 0, trackLayouts })).toEqual(
      expected
    );
  });

  it("accounts for vertical canvas scrolling", () => {
    expect(
      resolveTrackDropTarget({ clientY: 150, shellTop: 100, shellBottom: 500, scrollTop: 240, trackLayouts })
    ).toEqual({
      targetTrackId: "track-3",
      position: "after"
    });
  });

  it("clamps drops beyond the tracks to the first/last insertion point", () => {
    expect(
      resolveTrackDropTarget({ clientY: 20, shellTop: 100, shellBottom: 500, scrollTop: 0, trackLayouts })
    ).toEqual({
      targetTrackId: "track-1",
      position: "before"
    });
    expect(
      resolveTrackDropTarget({ clientY: 500, shellTop: 100, shellBottom: 500, scrollTop: 0, trackLayouts })
    ).toEqual({
      targetTrackId: "track-3",
      position: "after"
    });
  });

  it("returns null for an empty canvas", () => {
    expect(
      resolveTrackDropTarget({ clientY: 20, shellTop: 100, shellBottom: 500, scrollTop: 0, trackLayouts: [] })
    ).toBeNull();
  });

  it.each([
    [50, "track-1", "before"],
    [450, "track-10", "after"],
    [120, "track-3", "after"],
    [250, "track-5", "before"],
    [420, "track-6", "after"]
  ] as const)("resolves scrolled viewport coordinate %s to %s %s", (clientY, targetTrackId, position) => {
    expect(
      resolveTrackDropTarget({
        clientY,
        shellTop: 120,
        shellBottom: 420,
        scrollTop: 300,
        trackLayouts: Array.from({ length: 10 }, (_, index) => layout(`track-${index + 1}`, 28 + index * 100, 100))
      })
    ).toEqual({ targetTrackId, position });
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

describe("resolveTrackReorderKeyDirection", () => {
  const keyboardEvent = (overrides: Partial<Parameters<typeof resolveTrackReorderKeyDirection>[0]> = {}) => ({
    key: "ArrowDown",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides
  });

  it("resolves only unmodified vertical arrows", () => {
    expect(resolveTrackReorderKeyDirection(keyboardEvent({ key: "ArrowUp" }))).toBe(-1);
    expect(resolveTrackReorderKeyDirection(keyboardEvent({ key: "ArrowDown" }))).toBe(1);
    expect(resolveTrackReorderKeyDirection(keyboardEvent({ key: "ArrowLeft" }))).toBe(0);
  });

  it.each(["altKey", "ctrlKey", "metaKey", "shiftKey"] as const)("ignores arrows with %s", (modifier) => {
    expect(resolveTrackReorderKeyDirection(keyboardEvent({ [modifier]: true }))).toBe(0);
  });

  it("propagates edit chords, Escape, and modified vertical navigation", () => {
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "Escape" }))).toBe(true);
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "z", ctrlKey: true }))).toBe(true);
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "v", metaKey: true, altKey: true }))).toBe(true);
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "ArrowDown", shiftKey: true }))).toBe(true);
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "ArrowUp", altKey: true }))).toBe(true);
  });

  it("contains plain composition keys and unrelated Alt/Shift chords", () => {
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "z" }))).toBe(false);
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "x", altKey: true }))).toBe(false);
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "c", shiftKey: true }))).toBe(false);
    expect(shouldPropagateTrackReorderKeyDown(keyboardEvent({ key: "ArrowDown" }))).toBe(false);
  });
});

describe("resolveFocusedHandleScrollTop", () => {
  it("corrects a fitting handle at either viewport edge", () => {
    expect(
      resolveFocusedHandleScrollTop({
        currentScrollTop: 200,
        maxScrollTop: 800,
        handleTop: 80,
        handleBottom: 140,
        visibleTop: 100,
        visibleBottom: 300
      })
    ).toBe(180);
    expect(
      resolveFocusedHandleScrollTop({
        currentScrollTop: 200,
        maxScrollTop: 800,
        handleTop: 260,
        handleBottom: 340,
        visibleTop: 100,
        visibleBottom: 300
      })
    ).toBe(240);
  });

  it("aligns an oversized handle once instead of alternating between edges", () => {
    const firstTarget = resolveFocusedHandleScrollTop({
      currentScrollTop: 200,
      maxScrollTop: 800,
      handleTop: 180,
      handleBottom: 500,
      visibleTop: 100,
      visibleBottom: 300
    });
    expect(firstTarget).toBe(280);
    expect(
      resolveFocusedHandleScrollTop({
        currentScrollTop: firstTarget,
        maxScrollTop: 800,
        handleTop: 100,
        handleBottom: 420,
        visibleTop: 100,
        visibleBottom: 300
      })
    ).toBe(firstTarget);
  });

  it("clamps corrections to the shell's vertical scroll range", () => {
    expect(
      resolveFocusedHandleScrollTop({
        currentScrollTop: 10,
        maxScrollTop: 300,
        handleTop: 0,
        handleBottom: 40,
        visibleTop: 100,
        visibleBottom: 300
      })
    ).toBe(0);
    expect(
      resolveFocusedHandleScrollTop({
        currentScrollTop: 290,
        maxScrollTop: 300,
        handleTop: 280,
        handleBottom: 340,
        visibleTop: 100,
        visibleBottom: 300
      })
    ).toBe(300);
  });
});
