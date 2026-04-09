import { describe, expect, it } from "vitest";

import { resolveTrackCanvasSelectionFromRect } from "@/components/tracks/trackCanvasSelection";
import { TrackLayout } from "@/components/tracks/trackCanvasTypes";

describe("trackCanvasSelection", () => {
  const trackLayouts: TrackLayout[] = [
    {
      trackId: "track_1",
      index: 0,
      y: 28,
      height: 120,
      automationLanes: [
        { laneId: "macro_cutoff", laneType: "macro", macroId: "macro_cutoff", name: "Cutoff", y: 88, height: 30, expanded: true, automated: true }
      ]
    },
    {
      trackId: "track_2",
      index: 1,
      y: 148,
      height: 120,
      automationLanes: [
        { laneId: "macro_cutoff", laneType: "macro", macroId: "macro_cutoff", name: "Cutoff", y: 208, height: 30, expanded: true, automated: true }
      ]
    }
  ];

  it("selects only automation keyframes when the marquee stays inside one track's automation lanes", () => {
    const resolved = resolveTrackCanvasSelectionFromRect(
      { startX: 120, startY: 90, endX: 220, endY: 116 },
      [
        { trackId: "track_1", noteId: "note_a", x: 130, y: 40, w: 40, h: 20 }
      ],
      [
        {
          trackId: "track_1",
          macroId: "macro_cutoff",
          keyframeId: "key_a",
          beat: 2,
          value: 0.5,
          side: "single",
          kind: "single",
          x: 150,
          y: 100,
          hitLeft: 143,
          hitRight: 157,
          hitTop: 93,
          hitBottom: 107,
          boundary: null
        }
      ],
      trackLayouts
    );

    expect(resolved.noteKeys).toEqual([]);
    expect(resolved.automationKeyframeKeys).toEqual(["track_1:macro_cutoff:key_a"]);
  });

  it("selects notes as well once the marquee spans more than one track", () => {
    const resolved = resolveTrackCanvasSelectionFromRect(
      { startX: 120, startY: 90, endX: 220, endY: 220 },
      [
        { trackId: "track_1", noteId: "note_a", x: 130, y: 40, w: 40, h: 20 },
        { trackId: "track_2", noteId: "note_b", x: 140, y: 160, w: 40, h: 20 }
      ],
      [
        {
          trackId: "track_1",
          macroId: "macro_cutoff",
          keyframeId: "key_a",
          beat: 2,
          value: 0.5,
          side: "single",
          kind: "single",
          x: 150,
          y: 100,
          hitLeft: 143,
          hitRight: 157,
          hitTop: 93,
          hitBottom: 107,
          boundary: null
        },
        {
          trackId: "track_2",
          macroId: "macro_cutoff",
          keyframeId: "key_b",
          beat: 3,
          value: 0.4,
          side: "single",
          kind: "single",
          x: 170,
          y: 214,
          hitLeft: 163,
          hitRight: 177,
          hitTop: 207,
          hitBottom: 221,
          boundary: null
        }
      ],
      trackLayouts
    );

    expect(resolved.noteKeys).toEqual(["track_2:note_b"]);
    expect(resolved.automationKeyframeKeys).toEqual([
      "track_1:macro_cutoff:key_a",
      "track_2:macro_cutoff:key_b"
    ]);
  });
});
