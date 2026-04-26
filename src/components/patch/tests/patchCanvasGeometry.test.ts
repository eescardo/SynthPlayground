import { describe, expect, it } from "vitest";
import {
  findPatchNodeAtPoint,
  findPatchPortAtPoint,
  HitPort,
  resolveOutputHostPatchPortRect,
  resolvePatchCanvasSize,
  resolvePatchDiagramSize,
  resolvePatchFacePopoverRect
} from "@/components/patch/patchCanvasGeometry";
import { PATCH_CANVAS_GRID, PATCH_NODE_HEIGHT, PATCH_NODE_WIDTH } from "@/components/patch/patchCanvasConstants";
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

    expect(findPatchNodeAtPoint(patch, layoutByNode, 2 * PATCH_CANVAS_GRID + 10, 2 * PATCH_CANVAS_GRID + 10)).toBe("front");
  });

  it("hit tests ports by label rect", () => {
    const hitPorts: HitPort[] = [{ nodeId: "vco1", portId: "out", kind: "out", x: 120, y: 48, width: 32, height: 15 }];

    expect(findPatchPortAtPoint(hitPorts, 124, 51)).toEqual(hitPorts[0]);
    expect(findPatchPortAtPoint(hitPorts, 156, 70)).toBeNull();
  });

  it("anchors the managed output host port to the canvas right edge", () => {
    const rect = resolveOutputHostPatchPortRect(1400);

    expect(rect.x).toBe(1400);
    expect(rect.width).toBeGreaterThan(0);
  });
});
