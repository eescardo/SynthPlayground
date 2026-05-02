import { describe, expect, it } from "vitest";
import {
  findPatchNodeAtPoint,
  findPatchConnectionAtPoint,
  findPatchPortAtPoint,
  findPatchPortAtPointWithPadding,
  HitPort,
  resolveOutputHostPatchPortRect,
  resolveOutputHostPlacement,
  resolvePatchCanvasSize,
  resolvePatchConnectionAnchorPoint,
  resolvePatchConnectionMidpoint,
  resolvePatchDiagramSize,
  resolvePatchFacePopoverRect,
  resolvePatchPortAnchorPoint,
  resolveNearestRectEdgePoint
} from "@/components/patch/patchCanvasGeometry";
import {
  PATCH_CANVAS_GRID,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  PATCH_OUTPUT_HOST_STRIP_Y
} from "@/components/patch/patchCanvasConstants";
import { Patch, PatchLayoutNode } from "@/types/patch";

const patchWithNodes = (nodeIds: string[]): Pick<Patch, "nodes"> => ({
  nodes: nodeIds.map((id) => ({
    id,
    typeId: "VCO",
    params: {}
  }))
});

describe("patch canvas geometry", () => {
  it("resolves canvas size from laid out nodes", () => {
    const size = resolvePatchCanvasSize([
      { nodeId: "left", x: 2, y: 3 },
      { nodeId: "right", x: 70, y: 30 }
    ]);

    expect(size.width).toBeGreaterThan(70 * PATCH_CANVAS_GRID + PATCH_NODE_WIDTH);
    expect(size.height).toBeGreaterThan(30 * PATCH_CANVAS_GRID + PATCH_NODE_HEIGHT);
  });

  it("resolves diagram size without the minimum canvas floor", () => {
    const diagramSize = resolvePatchDiagramSize([{ nodeId: "vco1", x: 2, y: 3 }]);

    expect(diagramSize.width).toBeLessThan(resolvePatchCanvasSize([]).width);
    expect(diagramSize.width).toBeGreaterThan(2 * PATCH_CANVAS_GRID + PATCH_NODE_WIDTH);
  });

  it("centers face popovers around the module when there is room", () => {
    const layoutByNode = new Map<string, PatchLayoutNode>([["vco1", { nodeId: "vco1", x: 20, y: 12 }]]);
    const rect = resolvePatchFacePopoverRect("vco1", layoutByNode, { width: 1400, height: 900 });

    expect(rect).not.toBeNull();
    expect(rect?.x).toBeLessThan(20 * PATCH_CANVAS_GRID);
    expect(rect?.y).toBeLessThan(12 * PATCH_CANVAS_GRID);
  });

  it("hit tests nodes from front to back", () => {
    const patch = patchWithNodes(["back", "front"]);
    const layoutByNode = new Map<string, PatchLayoutNode>([
      ["back", { nodeId: "back", x: 2, y: 2 }],
      ["front", { nodeId: "front", x: 2, y: 2 }]
    ]);

    expect(findPatchNodeAtPoint(patch, layoutByNode, 2 * PATCH_CANVAS_GRID + 10, 2 * PATCH_CANVAS_GRID + 10)).toBe(
      "front"
    );
  });

  it("hit tests ports by label rect", () => {
    const hitPorts: HitPort[] = [{ nodeId: "vco1", portId: "out", kind: "out", x: 120, y: 48, width: 32, height: 15 }];

    expect(findPatchPortAtPoint(hitPorts, 124, 51)).toEqual(hitPorts[0]);
    expect(findPatchPortAtPoint(hitPorts, 156, 70)).toBeNull();
    expect(findPatchPortAtPointWithPadding(hitPorts, 156, 51, 6)).toEqual(hitPorts[0]);
  });

  it("anchors the patch output port to the canvas right edge", () => {
    const rect = resolveOutputHostPatchPortRect(1400);

    expect(rect.x).toBe(1400);
    expect(rect.width).toBeGreaterThan(0);
  });

  it("keeps output host placement fixed on screen while zoom and scroll change", () => {
    const zoomed = resolveOutputHostPlacement({
      canvasWidth: 1200,
      overhang: 8,
      scrollLeft: 320,
      viewportWidth: 900,
      zoom: 0.5
    });
    const unzoomed = resolveOutputHostPlacement({
      canvasWidth: 1200,
      overhang: 8,
      scrollLeft: 320,
      viewportWidth: 900,
      zoom: 1
    });

    expect(zoomed.screenLeft).toBe(unzoomed.screenLeft);
    expect(zoomed.canvasLeft).toBeGreaterThan(unzoomed.canvasLeft);
  });

  it("resolves the nearest edge point on a rectangle", () => {
    const rect = { x: 100, y: 200, width: 80, height: 40 };

    expect(resolveNearestRectEdgePoint(rect, { x: 130, y: 150 })).toEqual({ x: 130, y: 200 });
    expect(resolveNearestRectEdgePoint(rect, { x: 130, y: 280 })).toEqual({ x: 130, y: 240 });
    expect(resolveNearestRectEdgePoint(rect, { x: 40, y: 215 })).toEqual({ x: 100, y: 215 });
    expect(resolveNearestRectEdgePoint(rect, { x: 240, y: 215 })).toEqual({ x: 180, y: 215 });
  });

  it("uses the fixed output host anchor for connection geometry", () => {
    const patch: Pick<Patch, "nodes" | "ports" | "connections"> = {
      nodes: [{ id: "vco1", typeId: "VCO", params: {} }],
      ports: [{ id: "output", typeId: "Output", label: "output", params: {} }],
      connections: [{ id: "conn1", from: { nodeId: "vco1", portId: "out" }, to: { nodeId: "output", portId: "in" } }]
    };
    const layoutByNode = new Map<string, PatchLayoutNode>([["vco1", { nodeId: "vco1", x: 4, y: 4 }]]);
    const outputHostCanvasLeft = 1234;
    const fromAnchor = resolvePatchPortAnchorPoint(patch, layoutByNode, "vco1", "out", "out", outputHostCanvasLeft);
    const midpoint = resolvePatchConnectionMidpoint(patch, layoutByNode, "conn1", outputHostCanvasLeft);

    expect(midpoint?.x).toBeCloseTo(((fromAnchor?.x ?? 0) + outputHostCanvasLeft) / 2);
    expect(
      findPatchConnectionAtPoint(patch, layoutByNode, midpoint?.x ?? 0, midpoint?.y ?? 0, outputHostCanvasLeft)
    ).toBe("conn1");
  });

  it("anchors connection probe lines to the nearest point on the wire", () => {
    const patch: Pick<Patch, "nodes" | "ports" | "connections"> = {
      nodes: [{ id: "vco1", typeId: "VCO", params: {} }],
      ports: [{ id: "output", typeId: "Output", label: "output", params: {} }],
      connections: [{ id: "conn1", from: { nodeId: "vco1", portId: "out" }, to: { nodeId: "output", portId: "in" } }]
    };
    const layoutByNode = new Map<string, PatchLayoutNode>([["vco1", { nodeId: "vco1", x: 4, y: 4 }]]);
    const anchor = resolvePatchConnectionAnchorPoint(patch, layoutByNode, "conn1", { x: 1000, y: 440 }, 1234);
    const fromAnchor = resolvePatchPortAnchorPoint(patch, layoutByNode, "vco1", "out", "out", 1234);

    expect(anchor?.x).toBeGreaterThan(fromAnchor?.x ?? 0);
    expect(anchor?.x).toBeLessThan(1234);
    expect(anchor?.y).toBeGreaterThan(PATCH_OUTPUT_HOST_STRIP_Y);
  });
});
