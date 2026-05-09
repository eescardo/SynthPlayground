import { PATCH_CANVAS_GRID, PATCH_NODE_HEIGHT, PATCH_NODE_WIDTH } from "@/components/patch/patchCanvasConstants";

interface VisiblePlacementViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface VisiblePlacementNode {
  x: number;
  y: number;
}

export function resolveVisibleAddModulePosition(
  layoutNodes: VisiblePlacementNode[],
  viewport: VisiblePlacementViewport,
  zoom: number
) {
  const nodeGridWidth = Math.ceil(PATCH_NODE_WIDTH / PATCH_CANVAS_GRID);
  const nodeGridHeight = Math.ceil(PATCH_NODE_HEIGHT / PATCH_CANVAS_GRID);
  const viewportLeft = viewport.left / zoom;
  const viewportTop = viewport.top / zoom;
  const viewportRight = (viewport.left + viewport.width) / zoom;
  const viewportBottom = (viewport.top + viewport.height) / zoom;
  const minGridX = Math.max(0, Math.ceil(viewportLeft / PATCH_CANVAS_GRID) + 1);
  const minGridY = Math.max(0, Math.ceil(viewportTop / PATCH_CANVAS_GRID) + 1);
  const maxGridX = Math.max(minGridX, Math.floor(viewportRight / PATCH_CANVAS_GRID) - nodeGridWidth - 1);
  const maxGridY = Math.max(minGridY, Math.floor(viewportBottom / PATCH_CANVAS_GRID) - nodeGridHeight - 1);
  const occupiedRects = layoutNodes.map((node) => ({
    x: node.x,
    y: node.y,
    width: nodeGridWidth,
    height: nodeGridHeight
  }));

  for (let y = minGridY; y <= maxGridY; y += 1) {
    for (let x = minGridX; x <= maxGridX; x += 1) {
      const overlaps = occupiedRects.some(
        (rect) =>
          x < rect.x + rect.width &&
          x + nodeGridWidth > rect.x &&
          y < rect.y + rect.height &&
          y + nodeGridHeight > rect.y
      );
      if (!overlaps) {
        return { x, y };
      }
    }
  }

  return { x: minGridX, y: minGridY };
}
