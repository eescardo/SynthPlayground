import { describe, expect, it } from "vitest";
import { applyDraftParamValues, buildParamDraftKey } from "@/components/patch/patchEditorCanvasDrafts";
import { createClearPatch } from "@/lib/patch/presets";

describe("PatchEditorCanvas draft parameter values", () => {
  it("applies transient node and port parameter drafts without mutating the source patch", () => {
    const patch = createClearPatch({ id: "patch_draft", name: "Draft Patch" });
    patch.nodes.push({ id: "vca1", typeId: "VCA", params: { bias: 0, gain: 1 } });
    const preview = applyDraftParamValues(patch, {
      [buildParamDraftKey("vca1", "gain")]: 0.42,
      [buildParamDraftKey(patch.io.audioOutNodeId, "gainDb")]: -12
    });

    expect(preview).not.toBe(patch);
    expect(preview.nodes.find((node) => node.id === "vca1")?.params.gain).toBe(0.42);
    expect(preview.ports?.find((port) => port.id === patch.io.audioOutNodeId)?.params.gainDb).toBe(-12);
    expect(patch.nodes.find((node) => node.id === "vca1")?.params.gain).toBe(1);
    expect(patch.ports?.find((port) => port.id === patch.io.audioOutNodeId)?.params.gainDb).toBe(-6);
  });

  it("returns the original patch when there are no drafts", () => {
    const patch = createClearPatch({ id: "patch_no_draft", name: "No Draft" });

    expect(applyDraftParamValues(patch, {})).toBe(patch);
  });
});
