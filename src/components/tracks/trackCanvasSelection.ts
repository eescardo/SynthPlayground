import { AutomationKeyframeRect } from "@/components/tracks/trackCanvasAutomationLane";
import { TrackLayout } from "@/components/tracks/trackCanvasTypes";
import { ContentSelection, getAutomationSelectionKey, getNoteSelectionKey } from "@/lib/noteClipboard";

export interface TrackCanvasNoteSelectionRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrackCanvasSelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type ResolvedTrackCanvasSelection = ContentSelection;

const rectsIntersect = (
  left: number,
  right: number,
  top: number,
  bottom: number,
  rectLeft: number,
  rectRight: number,
  rectTop: number,
  rectBottom: number
) => rectLeft < right && rectRight > left && rectTop < bottom && rectBottom > top;

export function resolveTrackCanvasSelectionFromRect(
  selectionRect: TrackCanvasSelectionRect,
  noteRects: TrackCanvasNoteSelectionRect[],
  automationKeyframeRects: AutomationKeyframeRect[],
  trackLayouts: TrackLayout[]
): ResolvedTrackCanvasSelection {
  const left = Math.min(selectionRect.startX, selectionRect.endX);
  const right = Math.max(selectionRect.startX, selectionRect.endX);
  const top = Math.min(selectionRect.startY, selectionRect.endY);
  const bottom = Math.max(selectionRect.startY, selectionRect.endY);

  const intersectedTrackLayouts = trackLayouts.filter((layout) => top < layout.y + layout.height && bottom > layout.y);
  const automationOnlySingleTrack =
    intersectedTrackLayouts.length === 1 &&
    intersectedTrackLayouts[0]!.automationLanes.length > 0 &&
    top >= intersectedTrackLayouts[0]!.automationLanes[0]!.y &&
    bottom <= intersectedTrackLayouts[0]!.automationLanes[intersectedTrackLayouts[0]!.automationLanes.length - 1]!.y +
      intersectedTrackLayouts[0]!.automationLanes[intersectedTrackLayouts[0]!.automationLanes.length - 1]!.height;

  const automationSelectionKeys = automationKeyframeRects
    .filter((rect) =>
      rectsIntersect(left, right, top, bottom, rect.hitLeft, rect.hitRight, rect.hitTop, rect.hitBottom)
    )
    .map((rect) => getAutomationSelectionKey(rect.trackId, rect.macroId, rect.keyframeId));

  if (automationOnlySingleTrack) {
    return {
      noteKeys: [],
      automationKeyframeKeys: automationSelectionKeys
    };
  }

  const noteSelectionKeys = noteRects
    .filter((rect) => rectsIntersect(left, right, top, bottom, rect.x, rect.x + rect.w, rect.y, rect.y + rect.h))
    .map((rect) => getNoteSelectionKey(rect.trackId, rect.noteId));

  return {
    noteKeys: noteSelectionKeys,
    automationKeyframeKeys: automationSelectionKeys
  };
}
