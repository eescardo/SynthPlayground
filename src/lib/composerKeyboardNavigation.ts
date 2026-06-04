import { ContentSelection, parseNoteSelectionKey } from "@/lib/clipboard";
import { Note, Track } from "@/types/music";

export type HorizontalNavigationIntent =
  | { kind: "nudge-playhead"; beatSpan: "grid" | "measure" }
  | { kind: "nudge-content"; beatSpan: "grid" | "measure" }
  | { kind: "select-adjacent-note" }
  | { kind: "select-measure-relative-note" }
  | { kind: "clear-timeline-focus" }
  | { kind: "none" };

export type BoundaryNavigationIntent =
  | { kind: "jump-playhead"; boundary: "start" | "end" }
  | { kind: "select-boundary-note"; boundary: "start" | "end" }
  | { kind: "none" };

export interface SelectedTrackNote {
  track: Track;
  note: Note;
}

export const getSingleSelectedTrackNote = (
  tracks: Track[],
  contentSelection: ContentSelection
): SelectedTrackNote | null => {
  if (contentSelection.noteKeys.length !== 1 || contentSelection.automationKeyframeSelectionKeys.length > 0) {
    return null;
  }
  const parsed = parseNoteSelectionKey(contentSelection.noteKeys[0]!);
  if (!parsed) {
    return null;
  }
  const track = tracks.find((entry) => entry.id === parsed.trackId);
  const note = track?.notes.find((entry) => entry.id === parsed.noteId);
  return track && note ? { track, note } : null;
};

export const resolveComposerHorizontalArrowIntent = ({
  ctrlKey,
  altKey,
  metaKey,
  shiftKey,
  playheadNavigationActive,
  hasContentSelection,
  hasTimelineSelection,
  selectionCaptureFocused,
  hasSingleNoteSelection
}: {
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  playheadNavigationActive: boolean;
  hasContentSelection: boolean;
  hasTimelineSelection: boolean;
  selectionCaptureFocused: boolean;
  hasSingleNoteSelection: boolean;
}): HorizontalNavigationIntent => {
  const measureNavigationModifierPressed = !metaKey && (ctrlKey || altKey);
  if (playheadNavigationActive) {
    return { kind: "nudge-playhead", beatSpan: measureNavigationModifierPressed ? "measure" : "grid" };
  }
  if (hasContentSelection) {
    if (measureNavigationModifierPressed && shiftKey) {
      return hasSingleNoteSelection ? { kind: "select-measure-relative-note" } : { kind: "none" };
    }
    if (shiftKey) {
      return hasSingleNoteSelection ? { kind: "select-adjacent-note" } : { kind: "none" };
    }
    if (measureNavigationModifierPressed) {
      return hasSingleNoteSelection ? { kind: "nudge-content", beatSpan: "measure" } : { kind: "none" };
    }
    return { kind: "nudge-content", beatSpan: "grid" };
  }
  if (hasTimelineSelection) {
    return selectionCaptureFocused ? { kind: "clear-timeline-focus" } : { kind: "nudge-playhead", beatSpan: "grid" };
  }
  return { kind: "nudge-playhead", beatSpan: "grid" };
};

export const resolveComposerBoundaryNavigationIntent = ({
  key,
  metaKey,
  playheadNavigationActive,
  hasContentSelection,
  hasSingleNoteSelection
}: {
  key: string;
  metaKey: boolean;
  playheadNavigationActive: boolean;
  hasContentSelection: boolean;
  hasSingleNoteSelection: boolean;
}): BoundaryNavigationIntent | null => {
  const boundary =
    key === "Home" || (metaKey && key === "ArrowLeft")
      ? "start"
      : key === "End" || (metaKey && key === "ArrowRight")
        ? "end"
        : null;
  if (!boundary) {
    return null;
  }
  if (playheadNavigationActive) {
    return { kind: "jump-playhead", boundary };
  }
  if (hasContentSelection) {
    return hasSingleNoteSelection ? { kind: "select-boundary-note", boundary } : { kind: "none" };
  }
  return { kind: "jump-playhead", boundary };
};
