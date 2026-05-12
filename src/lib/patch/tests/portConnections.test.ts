import { describe, expect, it } from "vitest";

import { resolveConnectionIdsForPatchPort } from "@/lib/patch/portConnections";
import { createClearPatch } from "@/lib/patch/presets";

describe("patch port connections", () => {
  it("finds all outgoing wires attached to an output port", () => {
    const patch = createClearPatch({ id: "port_connections", name: "Port Connections" });
    patch.connections = [
      { id: "a", from: { nodeId: "osc1", portId: "out" }, to: { nodeId: "mix1", portId: "in1" } },
      { id: "b", from: { nodeId: "osc1", portId: "out" }, to: { nodeId: "mix1", portId: "in2" } },
      { id: "c", from: { nodeId: "env1", portId: "out" }, to: { nodeId: "vca1", portId: "gainCV" } }
    ];

    expect(
      resolveConnectionIdsForPatchPort(patch, {
        nodeId: "osc1",
        portId: "out",
        portKind: "out"
      })
    ).toEqual(["a", "b"]);
  });

  it("finds the incoming wire attached to an input port", () => {
    const patch = createClearPatch({ id: "input_port_connections", name: "Input Port Connections" });
    patch.connections = [
      { id: "a", from: { nodeId: "osc1", portId: "out" }, to: { nodeId: "mix1", portId: "in1" } },
      { id: "b", from: { nodeId: "osc2", portId: "out" }, to: { nodeId: "mix1", portId: "in2" } }
    ];

    expect(
      resolveConnectionIdsForPatchPort(patch, {
        nodeId: "mix1",
        portId: "in2",
        portKind: "in"
      })
    ).toEqual(["b"]);
  });
});
