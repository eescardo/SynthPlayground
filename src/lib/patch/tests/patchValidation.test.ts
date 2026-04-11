import { describe, expect, it } from "vitest";

import { drumPatch, pluckPatch } from "@/lib/patch/presets";
import { validatePatch } from "@/lib/patch/validation";
import { Patch } from "@/types/patch";

describe("patch validation", () => {
  it("rejects conflicting macro bindings across different macros", () => {
    const patch = pluckPatch();
    patch.ui.macros.push({
      id: "macro_conflict",
      name: "Conflict",
      keyframeCount: 2,
      bindings: [
        {
          id: "conflict_binding",
          nodeId: "karplus1",
          paramId: "brightness",
          map: "linear",
          min: 0.2,
          max: 0.8
        }
      ]
    });

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Conflicting macro bindings target the same parameter"))).toBe(true);
  });

  it("rejects duplicate bindings to the same parameter within one macro", () => {
    const patch = pluckPatch();
    patch.ui.macros[0].bindings.push({
      id: "dup_binding",
      nodeId: "vcf1",
      paramId: "cutoffHz",
      map: "linear",
      min: 100,
      max: 500
    });

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Macro binds the same parameter more than once"))).toBe(true);
  });

  it("rejects bindings whose keyframe count differs from the macro", () => {
    const patch = pluckPatch();
    patch.ui.macros[0].keyframeCount = 2;
    patch.ui.macros[0].bindings[0] = {
      ...patch.ui.macros[0].bindings[0],
      map: "piecewise",
      points: [
        { x: 0, y: 100 },
        { x: 0.5, y: 400 },
        { x: 1, y: 900 }
      ]
    };

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("keyframe count"))).toBe(true);
  });

  it("accepts bundled pluck preset with non-overlapping macro targets", () => {
    const patch: Patch = pluckPatch();

    const result = validatePatch(patch);

    expect(result.ok).toBe(true);
  });

  it("accepts bundled drum preset with non-overlapping macro targets", () => {
    const patch: Patch = drumPatch();

    const result = validatePatch(patch);

    expect(result.ok).toBe(true);
  });
});
