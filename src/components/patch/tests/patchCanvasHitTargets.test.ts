import { describe, expect, it } from "vitest";
import { resolvePatchCanvasHitTarget } from "@/components/patch/patchCanvasHitTargets";
import { resolvePatchConnectionMidpoint } from "@/components/patch/patchCanvasGeometry";
import { Patch, PatchLayoutNode } from "@/types/patch";

const patch: Pick<Patch, "nodes" | "ports" | "connections"> = {
  nodes: [{ id: "vco1", typeId: "VCO", params: {} }],
  ports: [{ id: "output", typeId: "Output", label: "output", params: {} }],
  connections: [{ id: "conn1", from: { nodeId: "vco1", portId: "out" }, to: { nodeId: "output", portId: "in" } }]
};

const layoutByNode = new Map<string, PatchLayoutNode>([["vco1", { nodeId: "vco1", x: 4, y: 4 }]]);

function resolveBaseTarget(overrides: Partial<Parameters<typeof resolvePatchCanvasHitTarget>[0]> = {}) {
  const point = resolvePatchConnectionMidpoint(patch, layoutByNode, "conn1", 1234) ?? { x: 0, y: 0 };
  return resolvePatchCanvasHitTarget({
    point,
    hitPorts: [],
    zoom: 1,
    patch: patch as Patch,
    layoutByNode,
    outputHostCanvasLeft: 1234,
    pendingFromPort: null,
    pendingProbeId: null,
    replacePrompt: null,
    getNodeAtPoint: () => null,
    getArmedWireCancelRect: () => null,
    ...overrides
  });
}

describe("patch canvas hit targets", () => {
  it("prefers module body hits over wires beneath them", () => {
    expect(resolveBaseTarget({ getNodeAtPoint: () => "coveringNode" })).toEqual({
      kind: "node",
      nodeId: "coveringNode"
    });
  });

  it("still resolves wire hits when no module covers the pointer", () => {
    expect(resolveBaseTarget()).toEqual({
      kind: "connection",
      connectionId: "conn1"
    });
  });
});
