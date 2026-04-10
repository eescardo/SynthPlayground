import { describe, expect, it } from "vitest";

import { ensurePatchLayout, resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { Patch } from "@/types/patch";

const makePatch = (layout: Patch["layout"] = { nodes: [] }): Patch => ({
  schemaVersion: 1,
  id: "patch_test",
  name: "Patch Test",
  meta: { source: "custom" },
  nodes: [
    { id: "pitch", typeId: "NotePitch", params: {} },
    { id: "vco", typeId: "VCO", params: {} },
    { id: "out", typeId: "Output", params: {} }
  ],
  connections: [
    { id: "c1", from: { nodeId: "pitch", portId: "out" }, to: { nodeId: "vco", portId: "pitch" } },
    { id: "c2", from: { nodeId: "vco", portId: "out" }, to: { nodeId: "out", portId: "in" } }
  ],
  ui: { macros: [] },
  layout,
  io: { audioOutNodeId: "out", audioOutPortId: "in" }
});

const crossingPatch = (): Patch => ({
  schemaVersion: 1,
  id: "patch_crossing",
  name: "Patch Crossing",
  meta: { source: "custom" },
  nodes: [
    { id: "a", typeId: "VCO", params: {} },
    { id: "b", typeId: "VCO", params: {} },
    { id: "x", typeId: "VCA", params: {} },
    { id: "y", typeId: "VCA", params: {} }
  ],
  connections: [
    { id: "c1", from: { nodeId: "a", portId: "out" }, to: { nodeId: "y", portId: "in" } },
    { id: "c2", from: { nodeId: "b", portId: "out" }, to: { nodeId: "x", portId: "in" } }
  ],
  ui: { macros: [] },
  layout: { nodes: [] },
  io: { audioOutNodeId: "y", audioOutPortId: "out" }
});

describe("patch auto layout", () => {
  it("orders connected modules from inputs to outputs", () => {
    const layout = resolveAutoLayoutNodes(makePatch());
    const xByNode = new Map(layout.map((node) => [node.nodeId, node.x]));

    expect(xByNode.get("pitch")).toBeLessThan(xByNode.get("vco") ?? 0);
    expect(xByNode.get("vco")).toBeLessThan(xByNode.get("out") ?? 0);
  });

  it("fills missing layout without replacing saved positions", () => {
    const patch = ensurePatchLayout(makePatch({ nodes: [{ nodeId: "pitch", x: 42, y: 7 }] }));

    expect(patch.layout.nodes).toHaveLength(3);
    expect(patch.layout.nodes.find((node) => node.nodeId === "pitch")).toEqual({ nodeId: "pitch", x: 42, y: 7 });
    expect(patch.layout.nodes.find((node) => node.nodeId === "vco")).toBeDefined();
    expect(patch.layout.nodes.find((node) => node.nodeId === "out")).toBeDefined();
  });

  it("replaces complete saved layouts when module boxes overlap", () => {
    const patch = ensurePatchLayout(makePatch({
      nodes: [
        { nodeId: "pitch", x: 2, y: 2 },
        { nodeId: "vco", x: 4, y: 2 },
        { nodeId: "out", x: 6, y: 2 }
      ]
    }));

    const xByNode = new Map(patch.layout.nodes.map((node) => [node.nodeId, node.x]));
    expect(xByNode.get("pitch")).toBeLessThan(xByNode.get("vco") ?? 0);
    expect(xByNode.get("vco")).toBeLessThan(xByNode.get("out") ?? 0);
    expect(xByNode.get("vco")).toBeGreaterThanOrEqual((xByNode.get("pitch") ?? 0) + 12);
  });

  it("orders columns by connected neighbors to reduce avoidable wire crossings", () => {
    const layout = resolveAutoLayoutNodes(crossingPatch());
    const yByNode = new Map(layout.map((node) => [node.nodeId, node.y]));

    expect(yByNode.get("a")).toBeLessThan(yByNode.get("b") ?? 0);
    expect(yByNode.get("y")).toBeLessThan(yByNode.get("x") ?? 0);
  });
});
