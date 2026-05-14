import { describe, expect, it } from "vitest";
import {
  getPlayheadScrollLeft,
  PLAYHEAD_VISIBLE_MARGIN_PX,
  PLAYHEAD_FOLLOW_VIEWPORT_RATIO
} from "@/components/tracks/trackCanvasAutoScroll";
import { BEAT_WIDTH, HEADER_WIDTH } from "@/components/tracks/trackCanvasConstants";

describe("track canvas playhead follow scroll", () => {
  it("keeps the viewport stationary before the playhead reaches the follow anchor", () => {
    const clientWidth = 1000;
    const anchorX = clientWidth * PLAYHEAD_FOLLOW_VIEWPORT_RATIO;
    const playheadBeat = (anchorX - HEADER_WIDTH - 1) / BEAT_WIDTH;

    expect(
      getPlayheadScrollLeft({
        playheadBeat,
        scrollLeft: 0,
        clientWidth,
        scrollWidth: 3000,
        strategy: "follow"
      })
    ).toBe(0);
  });

  it("scrolls forward to keep the playhead at the follow anchor", () => {
    const clientWidth = 1000;
    const playheadBeat = 20;
    const expected = HEADER_WIDTH + playheadBeat * BEAT_WIDTH - clientWidth * PLAYHEAD_FOLLOW_VIEWPORT_RATIO;

    expect(
      getPlayheadScrollLeft({
        playheadBeat,
        scrollLeft: 0,
        clientWidth,
        scrollWidth: 3000,
        strategy: "follow"
      })
    ).toBe(expected);
  });

  it("clamps to the available scroll range", () => {
    expect(
      getPlayheadScrollLeft({
        playheadBeat: 100,
        scrollLeft: 0,
        clientWidth: 1000,
        scrollWidth: 1200,
        strategy: "follow"
      })
    ).toBe(200);
  });

  it("uses minimum scrolling with a margin to bring hardware-navigation playhead moves into view", () => {
    const clientWidth = 1000;
    const playheadBeat = 20;
    const playheadX = HEADER_WIDTH + playheadBeat * BEAT_WIDTH;

    expect(
      getPlayheadScrollLeft({
        playheadBeat,
        scrollLeft: 0,
        clientWidth,
        scrollWidth: 3000,
        strategy: "reveal"
      })
    ).toBe(playheadX - clientWidth + PLAYHEAD_VISIBLE_MARGIN_PX);
  });

  it("does not scroll when the playhead is already visible with margin", () => {
    expect(
      getPlayheadScrollLeft({
        playheadBeat: 5,
        scrollLeft: 200,
        clientWidth: 1000,
        scrollWidth: 3000,
        strategy: "reveal"
      })
    ).toBe(200);
  });
});
