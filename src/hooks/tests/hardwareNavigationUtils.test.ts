import { afterEach, describe, expect, it, vi } from "vitest";
import { getTrackCanvasVisibleBeatRange } from "@/hooks/hardwareNavigationUtils";
import { HEADER_WIDTH } from "@/components/tracks/trackCanvasConstants";

afterEach(() => vi.unstubAllGlobals());

describe("getTrackCanvasVisibleBeatRange", () => {
  it.each([
    { scrollLeft: 80, clientWidth: HEADER_WIDTH + 100, expected: { startBeat: 8, endBeat: 18 } },
    { scrollLeft: -20, clientWidth: HEADER_WIDTH + 100, expected: { startBeat: 0, endBeat: 8 } },
    { scrollLeft: 80, clientWidth: HEADER_WIDTH - 10, expected: { startBeat: 8, endBeat: 8 } }
  ])("uses current scroll/width instead of stale dataset bounds: %j", ({ scrollLeft, clientWidth, expected }) => {
    vi.stubGlobal("document", {
      querySelector: () => ({
        scrollLeft,
        clientWidth,
        dataset: { beatWidth: "10", visibleBeatStart: "0", visibleBeatEnd: "99" }
      })
    });
    expect(getTrackCanvasVisibleBeatRange()).toEqual(expected);
  });

  it.each([undefined, "0", "invalid"])("falls back to published bounds with beat width %s", (beatWidth) => {
    vi.stubGlobal("document", {
      querySelector: () => ({ dataset: { beatWidth, visibleBeatStart: "2", visibleBeatEnd: "12" } })
    });
    expect(getTrackCanvasVisibleBeatRange()).toEqual({ startBeat: 2, endBeat: 12 });
  });

  it.each([
    null,
    { dataset: {} },
    { dataset: { visibleBeatStart: "8", visibleBeatEnd: "2" } },
    { dataset: { visibleBeatStart: "2", visibleBeatEnd: "Infinity" } }
  ])("returns no viewport for missing or invalid bounds: %j", (shell) => {
    vi.stubGlobal("document", { querySelector: () => shell });
    expect(getTrackCanvasVisibleBeatRange()).toBeNull();
  });
});
