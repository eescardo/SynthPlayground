import { describe, expect, it } from "vitest";
import { shouldResetPlayheadOnStop } from "@/hooks/usePlaybackController";

describe("shouldResetPlayheadOnStop", () => {
  it("defaults reset mode stops to the cue beat", () => {
    expect(shouldResetPlayheadOnStop("reset")).toBe(true);
  });

  it("defaults continue mode stops to the current playback beat", () => {
    expect(shouldResetPlayheadOnStop("continue")).toBe(false);
  });

  it("lets explicit stop options override the active play mode", () => {
    expect(shouldResetPlayheadOnStop("continue", { resetToCue: true })).toBe(true);
    expect(shouldResetPlayheadOnStop("reset", { resetToCue: false })).toBe(false);
  });
});
