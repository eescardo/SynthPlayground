import { describe, expect, it } from "vitest";
import { resolvePatchCanvasHitTarget } from "@/components/patch/patchCanvasHitTargets";
import { resolvePatchCanvasHitPorts, resolvePatchConnectionMidpoint } from "@/components/patch/patchCanvasGeometry";
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

  it("keeps module bodies ahead of wires while creating a wire", () => {
    expect(
      resolveBaseTarget({
        pendingFromPort: { nodeId: "source", portId: "out", kind: "out", x: 0, y: 0, width: 16, height: 12 },
        getNodeAtPoint: () => "coveringNode"
      })
    ).toEqual({
      kind: "node",
      nodeId: "coveringNode"
    });
  });

  it("keeps direct port hits ahead of modules and wires", () => {
    const port = { nodeId: "vco1", portId: "pitch", kind: "in" as const, x: 40, y: 40, width: 32, height: 14 };

    expect(
      resolveBaseTarget({
        point: { x: 44, y: 40 },
        hitPorts: [port],
        getNodeAtPoint: () => "coveringNode"
      })
    ).toEqual({
      kind: "port",
      port
    });
  });

  it("treats port hit rectangles as unzoomed canvas geometry", () => {
    const [port] = resolvePatchCanvasHitPorts(patch, layoutByNode);
    expect(port).toBeDefined();
    const zoom = 2;
    const screenPointInsidePort = {
      x: (port.x + port.width - 1) * zoom,
      y: port.y * zoom
    };
    const convertedCanvasPoint = {
      x: screenPointInsidePort.x / zoom,
      y: screenPointInsidePort.y / zoom
    };

    expect(
      resolveBaseTarget({
        point: convertedCanvasPoint,
        hitPorts: [port],
        zoom
      })
    ).toEqual({
      kind: "port",
      port
    });
    expect(
      resolveBaseTarget({
        point: { x: (port.x + port.width) * zoom - 1, y: port.y },
        hitPorts: [port],
        zoom
      }).kind
    ).not.toBe("port");
  });

  it("keeps wires attachable over module bodies while attaching a probe", () => {
    expect(resolveBaseTarget({ pendingProbeId: "probe1", getNodeAtPoint: () => "coveringNode" })).toEqual({
      kind: "connection",
      connectionId: "conn1"
    });
  });
});
