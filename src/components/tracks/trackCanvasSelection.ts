import { AutomationKeyframeRect } from "@/components/tracks/trackCanvasAutomationLane";
import { BEAT_WIDTH, HEADER_WIDTH, TRACK_HEIGHT } from "@/components/tracks/trackCanvasConstants";
import { TrackLayout } from "@/components/tracks/trackCanvasTypes";
import {
  ContentSelection,
  getAutomationSelectionKey,
  getNoteSelectionKey,
  parseNoteSelectionKey
} from "@/lib/clipboard";
import { Track } from "@/types/music";

export interface TrackCanvasNoteSelectionRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrackCanvasSelectedContentTabStopRect {
  x: number;
  y: number;
  w: number;
  h: number;
  ariaLabel: string;
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
    bottom <=
      intersectedTrackLayouts[0]!.automationLanes[intersectedTrackLayouts[0]!.automationLanes.length - 1]!.y +
        intersectedTrackLayouts[0]!.automationLanes[intersectedTrackLayouts[0]!.automationLanes.length - 1]!.height;

  const automationSelectionKeys = automationKeyframeRects
    .filter((rect) =>
      rectsIntersect(left, right, top, bottom, rect.hitLeft, rect.hitRight, rect.hitTop, rect.hitBottom)
    )
    .map((rect) => getAutomationSelectionKey(rect.trackId, rect.macroId, rect.keyframeId));

  if (automationOnlySingleTrack) {
    return {
      noteKeys: [],
      automationKeyframeSelectionKeys: automationSelectionKeys
    };
  }

  const noteSelectionKeys = noteRects
    .filter((rect) => rectsIntersect(left, right, top, bottom, rect.x, rect.x + rect.w, rect.y, rect.y + rect.h))
    .map((rect) => getNoteSelectionKey(rect.trackId, rect.noteId));

  return {
    noteKeys: noteSelectionKeys,
    automationKeyframeSelectionKeys: automationSelectionKeys
  };
}

export function resolveSelectedContentTabStopRect(
  tracks: Track[],
  selection: {
    kind: "none" | "note" | "timeline";
    beatRange?: { startBeat: number; endBeat: number };
    markerTrackId?: string;
    content?: { noteKeys: ReadonlySet<string>; automationKeyframeSelectionKeys: ReadonlySet<string> };
  },
  trackLayouts: TrackLayout[]
): TrackCanvasSelectedContentTabStopRect | null {
  if (selection.kind !== "note" || !selection.content) {
    return null;
  }

  if (selection.content.noteKeys.size !== 1 || selection.content.automationKeyframeSelectionKeys.size > 0) {
    if (!selection.beatRange || !selection.markerTrackId) {
      return null;
    }
    const layout = trackLayouts.find((entry) => entry.trackId === selection.markerTrackId);
    if (!layout) {
      return null;
    }

    return {
      ariaLabel: "Selected content",
      x: HEADER_WIDTH + selection.beatRange.startBeat * BEAT_WIDTH,
      y: layout.y + 14,
      w: Math.max(8, (selection.beatRange.endBeat - selection.beatRange.startBeat) * BEAT_WIDTH),
      h: TRACK_HEIGHT - 28
    };
  }

  const selectionKey = [...selection.content.noteKeys][0];
  if (!selectionKey) {
    return null;
  }

  const parsed = parseNoteSelectionKey(selectionKey);
  if (!parsed) {
    return null;
  }

  const track = tracks.find((entry) => entry.id === parsed.trackId);
  const layout = trackLayouts.find((entry) => entry.trackId === parsed.trackId);
  const note = track?.notes.find((entry) => entry.id === parsed.noteId);
  if (!track || !layout || !note) {
    return null;
  }

  return {
    ariaLabel: `Selected note ${note.pitchStr}`,
    x: HEADER_WIDTH + note.startBeat * BEAT_WIDTH,
    y: layout.y + 14,
    w: Math.max(8, note.durationBeats * BEAT_WIDTH),
    h: TRACK_HEIGHT - 28
  };
}
