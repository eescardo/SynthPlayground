import { describe, expect, it } from "vitest";

import { PATCH_CANVAS_MAX_ZOOM, PATCH_CANVAS_MIN_ZOOM } from "@/components/patch/patchCanvasConstants";
import { normalizePatch } from "@/lib/patch/normalize";

describe("normalizePatch", () => {
  it("normalizes persisted parameter slider ranges", () => {
    const patch = normalizePatch(
      {
        id: "patch_raw",
        name: "Raw",
        nodes: [],
        connections: [],
        ui: {
          paramRanges: {
            "node1:cutoffHz": { min: 5000, max: 120 },
            "node1:bad": { min: "low", max: 1 },
            "node1:missing": { min: 0 }
          }
        },
        layout: { nodes: [] },
        io: {}
      },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );

    expect(patch.ui.paramRanges).toEqual({
      "node1:cutoffHz": { min: 120, max: 5000 }
    });
  });

  it("preserves legacy piecewise macro maps only when keyframe points are usable", () => {
    const patch = normalizePatch(
      {
        id: "patch_raw",
        name: "Raw",
        nodes: [],
        connections: [],
        ui: {
          macros: [
            {
              id: "macro_1",
              name: "Sweep",
              keyframeCount: 3,
              bindings: [
                {
                  id: "binding_piecewise",
                  nodeId: "vcf1",
                  paramId: "cutoffHz",
                  map: "piecewise",
                  points: [
                    { x: 1, y: 5000 },
                    { x: 0, y: 120 },
                    { x: 0.5, y: 900 }
                  ]
                },
                {
                  id: "binding_too_short",
                  nodeId: "vcf1",
                  paramId: "resonance",
                  map: "piecewise",
                  points: [{ x: 0, y: 0.2 }]
                }
              ]
            }
          ]
        },
        layout: { nodes: [] },
        io: {}
      },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );

    expect(patch.ui.macros[0].bindings[0]).toMatchObject({
      map: "piecewise",
      points: [
        { x: 0, y: 120 },
        { x: 0.5, y: 900 },
        { x: 1, y: 5000 }
      ]
    });
    expect(patch.ui.macros[0].bindings[1]).toMatchObject({
      map: "linear",
      points: undefined
    });
  });

  it("clamps persisted canvas zoom into the supported range", () => {
    const tooLarge = normalizePatch(
      { id: "patch_large", name: "Large", nodes: [], connections: [], ui: { canvasZoom: 99 }, layout: { nodes: [] }, io: {} },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );
    const tooSmall = normalizePatch(
      { id: "patch_small", name: "Small", nodes: [], connections: [], ui: { canvasZoom: -10 }, layout: { nodes: [] }, io: {} },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );

    expect(tooLarge.ui.canvasZoom).toBe(PATCH_CANVAS_MAX_ZOOM);
    expect(tooSmall.ui.canvasZoom).toBe(PATCH_CANVAS_MIN_ZOOM);
  });
});
