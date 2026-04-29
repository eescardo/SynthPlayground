import { describe, expect, it } from "vitest";
import { formatPatchEndpointLabel, formatPatchParamTargetLabel } from "@/components/patch/patchInspectablePorts";
import { createClearPatch } from "@/lib/patch/presets";
import { PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";

describe("patch inspectable port labels", () => {
  it("formats the output endpoint by visible port name instead of serialized id", () => {
    const patch = createClearPatch({ id: "patch_labels", name: "Labels" });

    expect(formatPatchEndpointLabel(patch, { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" })).toBe("output.in");
    expect(formatPatchParamTargetLabel(patch, { nodeId: PATCH_OUTPUT_PORT_ID, paramId: "gainDb" })).toBe("output.gainDb");
  });
});
