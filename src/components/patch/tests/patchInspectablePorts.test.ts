import { describe, expect, it } from "vitest";
import { formatPatchEndpointLabel, formatPatchParamTargetLabel } from "@/components/patch/patchInspectablePorts";
import { createClearPatch } from "@/lib/patch/presets";

describe("patch inspectable port labels", () => {
  it("formats the output endpoint by visible port name instead of serialized id", () => {
    const patch = createClearPatch({ id: "patch_labels", name: "Labels" });

    expect(formatPatchEndpointLabel(patch, { nodeId: patch.io.audioOutNodeId, portId: patch.io.audioOutPortId })).toBe("output.in");
    expect(formatPatchParamTargetLabel(patch, { nodeId: patch.io.audioOutNodeId, paramId: "gainDb" })).toBe("output.gainDb");
  });
});
