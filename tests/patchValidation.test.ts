import { describe, expect, it } from "vitest";

import { pluckPatch } from "@/lib/patch/presets";
import { validatePatch } from "@/lib/patch/validation";
import { Patch } from "@/types/patch";

describe("patch validation", () => {
  it("rejects conflicting macro bindings across different macros", () => {
    const patch = pluckPatch();
    patch.ui.macros.push({
      id: "macro_conflict",
      name: "Conflict",
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

  it("accepts bundled pluck preset with non-overlapping macro targets", () => {
    const patch: Patch = pluckPatch();

    const result = validatePatch(patch);

    expect(result.ok).toBe(true);
  });
});
