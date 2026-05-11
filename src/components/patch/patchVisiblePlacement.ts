import { PATCH_CANVAS_GRID, PATCH_NODE_HEIGHT, PATCH_NODE_WIDTH } from "@/components/patch/patchCanvasConstants";
import { DEFAULT_SCOPE_PROBE_SIZE, DEFAULT_SPECTRUM_PROBE_SIZE } from "@/lib/patch/probes";
import { PatchWorkspaceProbeState } from "@/types/probes";

interface VisiblePlacementViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface VisiblePlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisiblePlacementNode {
  x: number;
  y: number;
}

function resolveVisibleGridPosition(
  occupiedRects: VisiblePlacementRect[],
  viewport: VisiblePlacementViewport,
  zoom: number,
  size: { width: number; height: number }
) {
  const viewportLeft = viewport.left / zoom;
  const viewportTop = viewport.top / zoom;
  const viewportRight = (viewport.left + viewport.width) / zoom;
  const viewportBottom = (viewport.top + viewport.height) / zoom;
  const minGridX = Math.max(0, Math.ceil(viewportLeft / PATCH_CANVAS_GRID) + 1);
  const minGridY = Math.max(0, Math.ceil(viewportTop / PATCH_CANVAS_GRID) + 1);
  const maxGridX = Math.max(minGridX, Math.floor(viewportRight / PATCH_CANVAS_GRID) - size.width - 1);
  const maxGridY = Math.max(minGridY, Math.floor(viewportBottom / PATCH_CANVAS_GRID) - size.height - 1);

  for (let y = minGridY; y <= maxGridY; y += 1) {
    for (let x = minGridX; x <= maxGridX; x += 1) {
      const overlaps = occupiedRects.some(
        (rect) =>
          x < rect.x + rect.width && x + size.width > rect.x && y < rect.y + rect.height && y + size.height > rect.y
      );
      if (!overlaps) {
        return { x, y };
      }
    }
  }

  return { x: minGridX, y: minGridY };
}

export function resolveVisibleAddModulePosition(
  layoutNodes: VisiblePlacementNode[],
  viewport: VisiblePlacementViewport,
  zoom: number
) {
  const nodeGridWidth = Math.ceil(PATCH_NODE_WIDTH / PATCH_CANVAS_GRID);
  const nodeGridHeight = Math.ceil(PATCH_NODE_HEIGHT / PATCH_CANVAS_GRID);
  return resolveVisibleGridPosition(
    layoutNodes.map((node) => ({
      x: node.x,
      y: node.y,
      width: nodeGridWidth,
      height: nodeGridHeight
    })),
    viewport,
    zoom,
    { width: nodeGridWidth, height: nodeGridHeight }
  );
}

export function resolveVisibleAddProbePosition(
  probes: Pick<PatchWorkspaceProbeState, "x" | "y" | "width" | "height">[],
  layoutNodes: VisiblePlacementNode[],
  kind: PatchWorkspaceProbeState["kind"],
  viewport: VisiblePlacementViewport,
  zoom: number
) {
  const nodeGridWidth = Math.ceil(PATCH_NODE_WIDTH / PATCH_CANVAS_GRID);
  const nodeGridHeight = Math.ceil(PATCH_NODE_HEIGHT / PATCH_CANVAS_GRID);
  const probeSize = kind === "spectrum" ? DEFAULT_SPECTRUM_PROBE_SIZE : DEFAULT_SCOPE_PROBE_SIZE;
  return resolveVisibleGridPosition(
    [
      ...layoutNodes.map((node) => ({
        x: node.x,
        y: node.y,
        width: nodeGridWidth,
        height: nodeGridHeight
      })),
      ...probes.map((probe) => ({
        x: probe.x,
        y: probe.y,
        width: probe.width,
        height: probe.height
      }))
    ],
    viewport,
    zoom,
    probeSize
  );
}
