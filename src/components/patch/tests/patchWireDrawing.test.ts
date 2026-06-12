import { describe, expect, it } from "vitest";
import { resolvePatchConnectionWireStyle } from "@/components/patch/patchWireDrawing";
import { resolveHostPatchPortTint } from "@/components/patch/patchCanvasGeometry";
import { getSignalCapabilityColor } from "@/lib/patch/moduleCategories";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { Patch, PortSchema } from "@/types/patch";

const port = (capabilities: PortSchema["capabilities"]): { schema: PortSchema } => ({
  schema: {
    id: "port",
    label: "Port",
    kind: "signal",
    capabilities,
    doc: "Test port"
  }
});

const patch: Patch = {
  schemaVersion: 4,
  id: "patch",
  name: "Patch",
  meta: { source: "custom" },
  nodes: [{ id: "vco1", typeId: "VCO", params: {} }],
  ports: [{ id: "output", typeId: "Output", label: "output", params: {} }],
  connections: [],
  ui: { macros: [] },
  layout: { nodes: [] }
};

describe("resolvePatchConnectionWireStyle", () => {
  it("renders audio wires to the output host port as solid audio wires", () => {
    const style = resolvePatchConnectionWireStyle(
      patch,
      { id: "conn1", from: { nodeId: "vco1", portId: "out" }, to: { nodeId: "output", portId: "in" } },
      port(["AUDIO"]),
      port(["AUDIO"])
    );

    expect(style).toEqual({
      strokeStyle: getSignalCapabilityColor("AUDIO"),
      dashed: false,
      globalAlpha: 1
    });
  });

  it("keeps non-output host wires dashed and tinted by host port", () => {
    const style = resolvePatchConnectionWireStyle(
      patch,
      { id: "conn1", from: { nodeId: HOST_PORT_IDS.gate, portId: "out" }, to: { nodeId: "vco1", portId: "fm" } },
      port(["GATE"]),
      port(["GATE"])
    );

    expect(style).toEqual({
      strokeStyle: resolveHostPatchPortTint(HOST_PORT_IDS.gate).wire,
      dashed: true,
      globalAlpha: 0.5
    });
  });
});
