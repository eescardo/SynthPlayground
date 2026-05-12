import { PATCH_NODE_HEIGHT, PATCH_NODE_WIDTH } from "@/components/patch/patchCanvasConstants";

export const PATCH_WIRE_TOOLTIP_WIDTH = 154;
export const PATCH_WIRE_TOOLTIP_HEIGHT = 56;
export const PATCH_WIRE_TOOLTIP_OFFSET = 14;
export const PATCH_WIRE_REPLACE_BUTTON_WIDTH = 46;
export const PATCH_WIRE_REPLACE_BUTTON_HEIGHT = 20;
export const PATCH_WIRE_CANCEL_BUTTON_WIDTH = 96;
export const PATCH_WIRE_CANCEL_BUTTON_HEIGHT = 24;
export const PATCH_WIRE_TOOLTIP_CANVAS_MARGIN = 6;
export const PATCH_WIRE_REPLACE_PROMPT_MAGNET_PADDING = 18;

export interface PatchWireTooltipBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PatchWireReplacePromptAnchor {
  kind: "in" | "out";
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isPointInCanvasRect(point: CanvasPoint, rect: CanvasRect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function clampTooltipRect(rect: CanvasRect, bounds?: PatchWireTooltipBounds): CanvasRect {
  if (!bounds) {
    return rect;
  }
  const minX = (bounds.x ?? 0) + PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
  const minY = (bounds.y ?? 0) + PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
  const maxX = (bounds.x ?? 0) + bounds.width - rect.width - PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
  const maxY = (bounds.y ?? 0) + bounds.height - rect.height - PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
  return {
    ...rect,
    x: Math.max(minX, Math.min(rect.x, Math.max(minX, maxX))),
    y: Math.max(minY, Math.min(rect.y, Math.max(minY, maxY)))
  };
}

export function resolveWireTooltipOrigin(
  pointer: CanvasPoint | null | undefined,
  bounds?: PatchWireTooltipBounds,
  tooltipSize = { width: PATCH_WIRE_TOOLTIP_WIDTH, height: PATCH_WIRE_TOOLTIP_HEIGHT }
) {
  if (!pointer) {
    return null;
  }
  let x = pointer.x + PATCH_WIRE_TOOLTIP_OFFSET;
  let y = pointer.y + PATCH_WIRE_TOOLTIP_OFFSET;
  if (bounds) {
    const minX = (bounds.x ?? 0) + PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
    const minY = (bounds.y ?? 0) + PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
    const maxX = (bounds.x ?? 0) + bounds.width - tooltipSize.width - PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
    const maxY = (bounds.y ?? 0) + bounds.height - tooltipSize.height - PATCH_WIRE_TOOLTIP_CANVAS_MARGIN;
    if (x > maxX) {
      x = pointer.x - PATCH_WIRE_TOOLTIP_OFFSET - tooltipSize.width;
    }
    if (y > maxY) {
      y = pointer.y - PATCH_WIRE_TOOLTIP_OFFSET - tooltipSize.height;
    }
    x = Math.max(minX, Math.min(x, Math.max(minX, maxX)));
    y = Math.max(minY, Math.min(y, Math.max(minY, maxY)));
  }
  return { x, y };
}

export function resolveWireReplacePromptOrigin(
  pointer: CanvasPoint | null | undefined,
  bounds?: PatchWireTooltipBounds,
  anchor?: PatchWireReplacePromptAnchor | null
) {
  if (!anchor) {
    return resolveWireTooltipOrigin(pointer, bounds);
  }
  return clampTooltipRect(
    {
      x:
        anchor.kind === "in"
          ? anchor.x + anchor.width + PATCH_WIRE_TOOLTIP_OFFSET
          : anchor.x - PATCH_WIRE_TOOLTIP_WIDTH - PATCH_WIRE_TOOLTIP_OFFSET,
      y: anchor.y - PATCH_WIRE_TOOLTIP_HEIGHT / 2,
      width: PATCH_WIRE_TOOLTIP_WIDTH,
      height: PATCH_WIRE_TOOLTIP_HEIGHT
    },
    bounds
  );
}

export function resolveWireReplacePromptRects(
  pointer: CanvasPoint | null | undefined,
  bounds?: PatchWireTooltipBounds,
  anchor?: PatchWireReplacePromptAnchor | null
) {
  const origin = resolveWireReplacePromptOrigin(pointer, bounds, anchor);
  if (!origin) {
    return null;
  }
  const gap = 8;
  const buttonGroupWidth = PATCH_WIRE_REPLACE_BUTTON_WIDTH * 2 + gap;
  const x = origin.x + (PATCH_WIRE_TOOLTIP_WIDTH - buttonGroupWidth) / 2;
  const y = origin.y;
  return {
    no: {
      x,
      y: y + 28,
      width: PATCH_WIRE_REPLACE_BUTTON_WIDTH,
      height: PATCH_WIRE_REPLACE_BUTTON_HEIGHT
    },
    yes: {
      x: x + PATCH_WIRE_REPLACE_BUTTON_WIDTH + gap,
      y: y + 28,
      width: PATCH_WIRE_REPLACE_BUTTON_WIDTH,
      height: PATCH_WIRE_REPLACE_BUTTON_HEIGHT
    }
  };
}

export function resolveWireReplacePromptBounds(
  pointer: CanvasPoint | null | undefined,
  bounds?: PatchWireTooltipBounds,
  anchor?: PatchWireReplacePromptAnchor | null
) {
  const origin = resolveWireReplacePromptOrigin(pointer, bounds, anchor);
  if (!origin) {
    return null;
  }
  return {
    x: origin.x,
    y: origin.y,
    width: PATCH_WIRE_TOOLTIP_WIDTH,
    height: PATCH_WIRE_TOOLTIP_HEIGHT
  };
}

export function resolveWireReplacePromptMagnetBounds(
  pointer: CanvasPoint | null | undefined,
  bounds?: PatchWireTooltipBounds,
  anchor?: PatchWireReplacePromptAnchor | null
) {
  const promptBounds = resolveWireReplacePromptBounds(pointer, bounds, anchor);
  if (!promptBounds) {
    return null;
  }
  return {
    x: promptBounds.x - PATCH_WIRE_REPLACE_PROMPT_MAGNET_PADDING,
    y: promptBounds.y - PATCH_WIRE_REPLACE_PROMPT_MAGNET_PADDING,
    width: promptBounds.width + PATCH_WIRE_REPLACE_PROMPT_MAGNET_PADDING * 2,
    height: promptBounds.height + PATCH_WIRE_REPLACE_PROMPT_MAGNET_PADDING * 2
  };
}

export function resolveWireReplaceSelectionAtPoint(
  point: CanvasPoint,
  pointer: CanvasPoint | null | undefined,
  bounds?: PatchWireTooltipBounds,
  anchor?: PatchWireReplacePromptAnchor | null
): "no" | "yes" | null {
  const promptRects = resolveWireReplacePromptRects(pointer, bounds, anchor);
  if (!promptRects) {
    return null;
  }
  if (isPointInCanvasRect(point, promptRects.yes)) {
    return "yes";
  }
  if (isPointInCanvasRect(point, promptRects.no)) {
    return "no";
  }
  return null;
}

export function resolveArmedWireCancelButtonRect(nodeX: number, nodeY: number) {
  return {
    x: nodeX + PATCH_NODE_WIDTH / 2 - PATCH_WIRE_CANCEL_BUTTON_WIDTH / 2,
    y: nodeY + PATCH_NODE_HEIGHT / 2 - PATCH_WIRE_CANCEL_BUTTON_HEIGHT / 2,
    width: PATCH_WIRE_CANCEL_BUTTON_WIDTH,
    height: PATCH_WIRE_CANCEL_BUTTON_HEIGHT
  };
}
