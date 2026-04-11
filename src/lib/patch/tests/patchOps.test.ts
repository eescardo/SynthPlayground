import { describe, expect, it } from "vitest";

import { applyPatchOp } from "@/lib/patch/ops";
import { pluckPatch } from "@/lib/patch/presets";

describe("patch ops", () => {
  it("persists macro slider moves into defaults and bound params", () => {
    const patch = pluckPatch();
    const macro = patch.ui.macros[0];
    const binding = macro.bindings[0];
    expect(macro).toBeDefined();
    expect(binding).toBeDefined();

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroValue",
      macroId: macro.id,
      normalized: 0.75
    });

    const nextMacro = nextPatch.ui.macros.find((entry) => entry.id === macro.id);
    const boundNode = nextPatch.nodes.find((node) => node.id === binding.nodeId);
    const expectedValue =
      binding.map === "exp"
        ? Math.max(binding.min ?? 0, 0.000001) * Math.pow((binding.max ?? binding.min ?? 0) / Math.max(binding.min ?? 0, 0.000001), 0.75)
        : (binding.min ?? 0) + ((binding.max ?? 1) - (binding.min ?? 0)) * 0.75;

    expect(nextMacro?.defaultNormalized).toBeCloseTo(0.75);
    expect(boundNode?.params[binding.paramId]).toBeCloseTo(expectedValue);
  });
});
