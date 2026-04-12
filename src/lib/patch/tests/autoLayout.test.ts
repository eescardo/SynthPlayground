import { describe, expect, it } from "vitest";

import { ensurePatchLayout, resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { padPatch } from "@/lib/patch/presets";
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
    expect(xByNode.get("pitch")).toBeGreaterThanOrEqual(4);
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

  it("places pad envelope near the amplifier instead of as a far-left source", () => {
    const layout = resolveAutoLayoutNodes(padPatch());
    const xByNode = new Map(layout.map((node) => [node.nodeId, node.x]));

    expect(xByNode.get("env1")).toBeGreaterThan(xByNode.get("mix1") ?? 0);
    expect(xByNode.get("env1")).toBeLessThanOrEqual(xByNode.get("vca1") ?? 0);
  });

  it("uses the longest output dependency path for shared modulation dependencies", () => {
    const layout = resolveAutoLayoutNodes(padPatch());
    const xByNode = new Map(layout.map((node) => [node.nodeId, node.x]));
    const yByNode = new Map(layout.map((node) => [node.nodeId, node.y]));

    expect(xByNode.get("lfo1")).toBeLessThanOrEqual(xByNode.get("vco2") ?? 0);
    expect(xByNode.get("lfo1")).toBeLessThan(xByNode.get("vcf1") ?? 0);
    expect(yByNode.get("lfo1")).toBeGreaterThan(yByNode.get("vco2") ?? 0);
  });
});
