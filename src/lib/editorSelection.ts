import {
  BeatRange,
  ContentSelection,
  EMPTY_CONTENT_SELECTION,
  getSelectionBeatRange,
  getSelectionSourceTrackId
} from "@/lib/clipboard/selection";
import { Project } from "@/types/music";

export type SelectionActionScope = "source" | "all-tracks";

export type EditorSelectionState =
  | {
      kind: "none";
      content: ContentSelection;
      marqueeActive: boolean;
      actionScopePreview: SelectionActionScope;
    }
  | {
      kind: "content";
      content: ContentSelection;
      marqueeActive: boolean;
      actionScopePreview: SelectionActionScope;
    }
  | {
      kind: "timeline";
      content: ContentSelection;
      beatRange: BeatRange;
      marqueeActive: boolean;
      actionScopePreview: "all-tracks";
    };

export const createEmptyEditorSelection = (): EditorSelectionState => ({
  kind: "none",
  content: { ...EMPTY_CONTENT_SELECTION },
  marqueeActive: false,
  actionScopePreview: "source"
});

export const hasContentSelection = (selection: ContentSelection) =>
  selection.noteKeys.length > 0 || selection.automationKeyframeSelectionKeys.length > 0;

export const setEditorContentSelection = (
  current: EditorSelectionState,
  content: ContentSelection
): EditorSelectionState =>
  hasContentSelection(content)
    ? {
        kind: "content",
        content,
        marqueeActive: current.marqueeActive,
        actionScopePreview: current.actionScopePreview === "all-tracks" ? "source" : current.actionScopePreview
      }
    : {
        kind: "none",
        content,
        marqueeActive: current.marqueeActive,
        actionScopePreview: "source"
      };

export const setEditorTimelineSelection = (
  current: EditorSelectionState,
  beatRange: BeatRange | null
): EditorSelectionState =>
  beatRange
    ? {
        kind: "timeline",
        content: { ...EMPTY_CONTENT_SELECTION },
        beatRange,
        marqueeActive: current.marqueeActive,
        actionScopePreview: "all-tracks"
      }
    : {
        kind: "none",
        content: { ...EMPTY_CONTENT_SELECTION },
        marqueeActive: current.marqueeActive,
        actionScopePreview: "source"
      };

export const clearEditorSelection = (): EditorSelectionState => createEmptyEditorSelection();

export const setEditorSelectionMarqueeActive = (
  current: EditorSelectionState,
  marqueeActive: boolean
): EditorSelectionState => ({ ...current, marqueeActive });

export const setEditorSelectionActionScopePreview = (
  current: EditorSelectionState,
  actionScopePreview: SelectionActionScope
): EditorSelectionState =>
  current.kind === "timeline"
    ? { ...current, actionScopePreview: "all-tracks" }
    : { ...current, actionScopePreview };

export const getEditorSelectionBeatRange = (project: Project, selection: EditorSelectionState): BeatRange | null =>
  selection.kind === "timeline"
    ? selection.beatRange
    : selection.kind === "content"
      ? getSelectionBeatRange(project, selection.content.noteKeys, selection.content.automationKeyframeSelectionKeys)
      : null;

export const getEditorSelectionSourceTrackId = (project: Project, selection: EditorSelectionState): string | null =>
  selection.kind === "content"
    ? getSelectionSourceTrackId(project, selection.content.noteKeys, selection.content.automationKeyframeSelectionKeys)
    : null;

export const filterEditorSelectionToProject = (project: Project, selection: EditorSelectionState): EditorSelectionState => {
  const existingNoteSelectionKeys = new Set(
    project.tracks.flatMap((track) => track.notes.map((note) => `${track.id}:${note.id}`))
  );
  const existingAutomationSelectionKeys = new Set(
    project.tracks.flatMap((track) =>
      Object.values(track.macroAutomations).flatMap((lane) =>
        lane.keyframes.map((keyframe) => `${track.id}:${lane.macroId}:${keyframe.id}`)
      )
    )
  );

  const nextContent: ContentSelection = {
    noteKeys: selection.content.noteKeys.filter((selectionKey) => existingNoteSelectionKeys.has(selectionKey)),
    automationKeyframeSelectionKeys: selection.content.automationKeyframeSelectionKeys.filter((selectionKey) =>
      existingAutomationSelectionKeys.has(selectionKey)
    )
  };

  if (selection.kind === "timeline") {
    return selection;
  }

  return setEditorContentSelection(selection, nextContent);
};
