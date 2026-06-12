import { describe, expect, it } from "vitest";
import { resolveFixedLaneSliderBounds } from "@/components/tracks/trackCanvasAutomationLane";
import { FIXED_MACRO_SLIDER_START_OFFSET, HEADER_WIDTH } from "@/components/tracks/trackCanvasConstants";
import { createTrackCanvasViewport } from "@/components/tracks/trackCanvasRenderModel";

describe("resolveFixedLaneSliderBounds", () => {
  it("keeps fixed macro sliders pinned beside the sticky track chrome while horizontally scrolled", () => {
    const scrollLeft = 480;

    expect(
      resolveFixedLaneSliderBounds({
        headerWidth: HEADER_WIDTH,
        viewport: createTrackCanvasViewport(scrollLeft, 900),
        width: 2000
      }).sliderStartX
    ).toBe(scrollLeft + HEADER_WIDTH + FIXED_MACRO_SLIDER_START_OFFSET);
  });

  it("keeps the slider inside the visible viewport", () => {
    const bounds = resolveFixedLaneSliderBounds({
      headerWidth: HEADER_WIDTH,
      viewport: createTrackCanvasViewport(480, 360),
      width: 2000
    });

    expect(bounds.sliderEndX).toBeLessThanOrEqual(480 + 360 - 10);
    expect(bounds.sliderEndX).toBeGreaterThan(bounds.sliderStartX);
  });
});
