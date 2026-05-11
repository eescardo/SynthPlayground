import { describe, expect, it } from "vitest";
import {
  isPointInCanvasRect,
  resolveWireReplacePromptBounds,
  resolveWireReplacePromptRects,
  resolveWireReplaceSelectionAtPoint
} from "@/components/patch/patchWireGeometry";

describe("patchWireGeometry", () => {
  it("centers replace prompt buttons within the prompt bounds", () => {
    const pointer = { x: 100, y: 100 };
    const bounds = resolveWireReplacePromptBounds(pointer);
    const rects = resolveWireReplacePromptRects(pointer);

    expect(bounds).not.toBeNull();
    expect(rects).not.toBeNull();
    if (!bounds || !rects) {
      return;
    }

    const groupLeft = rects.no.x;
    const groupRight = rects.yes.x + rects.yes.width;
    const leftInset = groupLeft - bounds.x;
    const rightInset = bounds.x + bounds.width - groupRight;
    expect(leftInset).toBeCloseTo(rightInset);
  });

  it("resolves replace prompt hit selection from button rects", () => {
    const pointer = { x: 100, y: 100 };
    const rects = resolveWireReplacePromptRects(pointer);
    expect(rects).not.toBeNull();
    if (!rects) {
      return;
    }

    expect(resolveWireReplaceSelectionAtPoint({ x: rects.no.x + 1, y: rects.no.y + 1 }, pointer)).toBe("no");
    expect(resolveWireReplaceSelectionAtPoint({ x: rects.yes.x + 1, y: rects.yes.y + 1 }, pointer)).toBe("yes");
    expect(isPointInCanvasRect({ x: rects.yes.x + rects.yes.width + 1, y: rects.yes.y }, rects.yes)).toBe(false);
  });
});
