import { describe, expect, it } from "vitest";
import { formatPatchEndpointLabel, formatPatchParamTargetLabel } from "@/components/patch/patchInspectablePorts";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { createClearPatch } from "@/lib/patch/presets";
import { PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";

describe("patch inspectable port labels", () => {
  it("formats the output endpoint by visible port name instead of serialized id", () => {
    const patch = createClearPatch({ id: "patch_labels", name: "Labels" });

    expect(formatPatchEndpointLabel(patch, { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" })).toBe("output.in");
    expect(formatPatchParamTargetLabel(patch, { nodeId: PATCH_OUTPUT_PORT_ID, paramId: "gainDb" })).toBe(
      "output.gainDb"
    );
  });

  it("formats host source endpoints by visible port name instead of serialized id", () => {
    const patch = createClearPatch({ id: "patch_labels", name: "Labels" });

    expect(formatPatchEndpointLabel(patch, { nodeId: HOST_PORT_IDS.pitch, portId: "out" })).toBe("pitch.out");
    expect(formatPatchEndpointLabel(patch, { nodeId: HOST_PORT_IDS.gate, portId: "out" })).toBe("gate.out");
    expect(formatPatchEndpointLabel(patch, { nodeId: HOST_PORT_IDS.velocity, portId: "out" })).toBe("velocity.out");
    expect(formatPatchEndpointLabel(patch, { nodeId: HOST_PORT_IDS.modWheel, portId: "out" })).toBe("modwheel.out");
  });
});
