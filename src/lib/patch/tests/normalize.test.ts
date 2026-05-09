import { describe, expect, it } from "vitest";

import { PATCH_CANVAS_MAX_ZOOM, PATCH_CANVAS_MIN_ZOOM } from "@/components/patch/patchCanvasConstants";
import { normalizePatch } from "@/lib/patch/normalize";

describe("normalizePatch", () => {
  it("migrates legacy CVMixer2 nodes to CVMixer4", () => {
    const patch = normalizePatch(
      {
        id: "patch_raw",
        name: "Raw",
        nodes: [
          {
            id: "cvmix1",
            typeId: "CVMixer2",
            params: { gain1: 0.5, gain2: -0.25 }
          }
        ],
        connections: [],
        layout: { nodes: [] },
        ui: {},
        io: {}
      },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );

    expect(patch.nodes.find((node) => node.id === "cvmix1")).toMatchObject({
      typeId: "CVMixer4",
      params: { gain1: 0.5, gain2: -0.25, gain3: 1, gain4: 1 }
    });
  });

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
      id: "macro_1:vcf1:cutoffHz",
      map: "piecewise",
      points: [
        { x: 0, y: 120 },
        { x: 0.5, y: 900 },
        { x: 1, y: 5000 }
      ]
    });
    expect(patch.ui.macros[0].bindings[1]).toMatchObject({
      id: "macro_1:vcf1:resonance",
      map: "linear",
      points: undefined
    });
  });

  it("clamps persisted canvas zoom into the supported range", () => {
    const tooLarge = normalizePatch(
      {
        id: "patch_large",
        name: "Large",
        nodes: [],
        connections: [],
        ui: { canvasZoom: 99 },
        layout: { nodes: [] },
        io: {}
      },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );
    const tooSmall = normalizePatch(
      {
        id: "patch_small",
        name: "Small",
        nodes: [],
        connections: [],
        ui: { canvasZoom: -10 },
        layout: { nodes: [] },
        io: {}
      },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );

    expect(tooLarge.ui.canvasZoom).toBe(PATCH_CANVAS_MAX_ZOOM);
    expect(tooSmall.ui.canvasZoom).toBe(PATCH_CANVAS_MIN_ZOOM);
  });

  it("fills missing current params and drops stale persisted params", () => {
    const patch = normalizePatch(
      {
        id: "patch_schema_drift",
        name: "Schema Drift",
        schemaVersion: 4,
        nodes: [
          {
            id: "env1",
            typeId: "ADSR",
            params: {
              attack: 10,
              decay: 200,
              sustain: 0.7,
              release: 250
            }
          },
          {
            id: "verb1",
            typeId: "Reverb",
            params: {
              size: 0.8,
              decay: 1.5,
              damping: 0.4,
              mix: 0.5
            }
          }
        ],
        connections: [],
        ui: {},
        layout: { nodes: [] },
        io: {}
      },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );

    expect(patch.nodes.find((node) => node.id === "env1")?.params).toMatchObject({
      attack: 10,
      decay: 200,
      sustain: 0.7,
      release: 250,
      curve: 0,
      mode: "retrigger_from_current"
    });
    expect(patch.nodes.find((node) => node.id === "verb1")?.params).toEqual({
      mode: "room",
      decay: 1,
      tone: 0.55,
      mix: 0.5
    });
  });

  it("removes stale ranges and bindings when normalizing current schema params", () => {
    const patch = normalizePatch(
      {
        id: "patch_schema_drift_bindings",
        name: "Schema Drift Bindings",
        schemaVersion: 4,
        nodes: [
          {
            id: "verb1",
            typeId: "Reverb",
            params: {
              size: 0.8,
              decay: 1.5,
              damping: 0.4,
              mix: 0.5
            }
          }
        ],
        connections: [],
        ui: {
          paramRanges: {
            "verb1:size": { min: 0, max: 1 },
            "verb1:decay": { min: 0.2, max: 5 }
          },
          macros: [
            {
              id: "macro_verb",
              name: "Verb",
              keyframeCount: 2,
              bindings: [
                { id: "legacy_size", nodeId: "verb1", paramId: "size", map: "linear", min: 0, max: 1 },
                { id: "legacy_decay", nodeId: "verb1", paramId: "decay", map: "linear", min: 1, max: 5 }
              ]
            }
          ]
        },
        layout: { nodes: [] },
        io: {}
      },
      { fallbackId: "fallback", fallbackName: "Fallback" }
    );

    expect(patch.ui.paramRanges).toEqual({
      "verb1:decay": { min: 0.2, max: 1 }
    });
    expect(patch.ui.macros[0].bindings).toEqual([
      expect.objectContaining({
        id: "macro_verb:verb1:decay",
        nodeId: "verb1",
        paramId: "decay",
        min: 1,
        max: 1
      })
    ]);
  });
});
