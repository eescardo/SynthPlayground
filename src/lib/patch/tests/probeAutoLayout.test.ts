import { describe, expect, it } from "vitest";
import { resolveAutoLayoutProbePositions } from "@/lib/patch/probeAutoLayout";
import { Patch } from "@/types/patch";
import { PatchWorkspaceProbeState } from "@/types/probes";

const patch: Patch = {
  schemaVersion: 1,
  id: "probe_layout_patch",
  name: "Probe Layout Patch",
  meta: { source: "custom" },
  nodes: [
    { id: "vco1", typeId: "VCO", params: {} },
    { id: "output", typeId: "Output", params: {} }
  ],
  connections: [
    { id: "c1", from: { nodeId: "vco1", portId: "out" }, to: { nodeId: "output", portId: "in" } }
  ],
  ui: { macros: [] },
  layout: {
    nodes: [
      { nodeId: "vco1", x: 8, y: 6 },
      { nodeId: "output", x: 24, y: 6 }
    ]
  },
  io: {
    audioOutNodeId: "output",
    audioOutPortId: "in"
  }
};

const baseProbe: PatchWorkspaceProbeState = {
  id: "probe1",
  kind: "scope",
  name: "Scope",
  x: 0,
  y: 0,
  width: 6,
  height: 4,
  target: { kind: "port", nodeId: "vco1", portId: "out", portKind: "out" }
};

describe("probe auto layout", () => {
  it("places probes near their target port", () => {
    const layoutByNode = new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));

    const [placed] = resolveAutoLayoutProbePositions(patch, [baseProbe], layoutByNode);

    expect(placed?.x).toBeGreaterThan(8);
    expect(placed?.y).toBeGreaterThanOrEqual(0);
  });

  it("moves probes off occupied module rectangles", () => {
    const layoutByNode = new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));
    const crowdedProbe: PatchWorkspaceProbeState = {
      ...baseProbe,
      width: 10,
      height: 6
    };

    const [placed] = resolveAutoLayoutProbePositions(patch, [crowdedProbe], layoutByNode);

    expect(placed).toBeDefined();
    expect(placed?.x).not.toBe(8);
    expect(placed?.y).not.toBe(6);
  });
});
