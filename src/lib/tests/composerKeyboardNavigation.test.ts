import { describe, expect, it } from "vitest";
import {
  resolveComposerBoundaryNavigationIntent,
  resolveComposerHorizontalArrowIntent
} from "@/lib/composerKeyboardNavigation";

const baseHorizontalArgs = {
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  playheadNavigationActive: false,
  hasContentSelection: false,
  hasTimelineSelection: false,
  selectionCaptureFocused: false,
  hasSingleNoteSelection: false
};

describe("resolveComposerHorizontalArrowIntent", () => {
  it("routes playhead measure navigation through Ctrl or Option arrows", () => {
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        ctrlKey: true,
        playheadNavigationActive: true
      })
    ).toEqual({ kind: "nudge-playhead", beatSpan: "measure" });
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        altKey: true,
        playheadNavigationActive: true
      })
    ).toEqual({ kind: "nudge-playhead", beatSpan: "measure" });
  });

  it("keeps Cmd arrows available for boundary navigation", () => {
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        metaKey: true,
        playheadNavigationActive: true
      })
    ).toEqual({ kind: "nudge-playhead", beatSpan: "grid" });
  });

  it("only enables measure note movement for single-note selections", () => {
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        ctrlKey: true,
        hasContentSelection: true,
        hasSingleNoteSelection: true
      })
    ).toEqual({ kind: "nudge-content", beatSpan: "measure" });
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        ctrlKey: true,
        hasContentSelection: true,
        hasSingleNoteSelection: false
      })
    ).toEqual({ kind: "none" });
  });

  it("routes shifted note selection intents only for single-note selections", () => {
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        shiftKey: true,
        hasContentSelection: true,
        hasSingleNoteSelection: true
      })
    ).toEqual({ kind: "select-adjacent-note" });
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        altKey: true,
        shiftKey: true,
        hasContentSelection: true,
        hasSingleNoteSelection: true
      })
    ).toEqual({ kind: "select-measure-relative-note" });
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        shiftKey: true,
        hasContentSelection: true,
        hasSingleNoteSelection: false
      })
    ).toEqual({ kind: "none" });
  });

  it("nudges playhead through timeline selections unless the selection owns focus", () => {
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        hasTimelineSelection: true,
        selectionCaptureFocused: false
      })
    ).toEqual({ kind: "nudge-playhead", beatSpan: "grid" });
    expect(
      resolveComposerHorizontalArrowIntent({
        ...baseHorizontalArgs,
        hasTimelineSelection: true,
        selectionCaptureFocused: true
      })
    ).toEqual({ kind: "clear-timeline-focus" });
  });
});

describe("resolveComposerBoundaryNavigationIntent", () => {
  it("uses Home/End and Cmd arrows for playhead boundaries", () => {
    expect(
      resolveComposerBoundaryNavigationIntent({
        key: "Home",
        metaKey: false,
        playheadNavigationActive: true,
        hasContentSelection: false,
        hasSingleNoteSelection: false
      })
    ).toEqual({ kind: "jump-playhead", boundary: "start" });
    expect(
      resolveComposerBoundaryNavigationIntent({
        key: "ArrowRight",
        metaKey: true,
        playheadNavigationActive: true,
        hasContentSelection: false,
        hasSingleNoteSelection: false
      })
    ).toEqual({ kind: "jump-playhead", boundary: "end" });
  });

  it("uses boundary keys for first or last note only with a single-note selection", () => {
    expect(
      resolveComposerBoundaryNavigationIntent({
        key: "End",
        metaKey: false,
        playheadNavigationActive: false,
        hasContentSelection: true,
        hasSingleNoteSelection: true
      })
    ).toEqual({ kind: "select-boundary-note", boundary: "end" });
    expect(
      resolveComposerBoundaryNavigationIntent({
        key: "End",
        metaKey: false,
        playheadNavigationActive: false,
        hasContentSelection: true,
        hasSingleNoteSelection: false
      })
    ).toEqual({ kind: "none" });
  });
});
