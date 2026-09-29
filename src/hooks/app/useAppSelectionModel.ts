"use client";

import { useMemo, useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import type { TrackCanvasSelection } from "@/components/tracks/TrackCanvas";
import {
  filterEditorSelectionToProject,
  setEditorSelectionActionScopePreview,
  type ContentSelection,
  getContentSelectionLabel,
  getEditorSelectionBeatRange,
  getEditorSelectionSourceTrackId,
  type EditorSelectionState
} from "@/lib/clipboard";
import type { Project } from "@/types/music";
import type { useComposerTransientUi } from "@/hooks/useComposerTransientUi";

export function useAppSelectionModel(project: Project, editorSelection: EditorSelectionState) {
  const selectedContent = editorSelection.content;
  const selectedNoteKeySet = useMemo(() => new Set(selectedContent.noteKeys), [selectedContent.noteKeys]);
  const selectedAutomationKeyframeSet = useMemo(
    () => new Set(selectedContent.automationKeyframeSelectionKeys),
    [selectedContent.automationKeyframeSelectionKeys]
  );
  const noteSelectionBeatRange = useMemo(
    () => getEditorSelectionBeatRange(project, editorSelection),
    [editorSelection, project]
  );
  const hasTimelineRangeSelection = editorSelection.kind === "timeline";
  const noteSelectionTrackLabel = useMemo(
    () => getContentSelectionLabel(project.tracks, selectedContent),
    [project.tracks, selectedContent]
  );
  const noteSelectionSourceTrackId = useMemo(
    () => getEditorSelectionSourceTrackId(project, editorSelection),
    [editorSelection, project]
  );
  const canvasSelection = useMemo<TrackCanvasSelection>(() => {
    if (editorSelection.kind === "timeline") {
      return {
        kind: "timeline",
        beatRange: editorSelection.beatRange,
        label: "All Tracks",
        markerTrackId: project.tracks[0]?.id ?? ""
      };
    }
    if (editorSelection.kind === "content" && noteSelectionBeatRange && noteSelectionSourceTrackId) {
      return {
        kind: "note",
        content: {
          noteKeys: selectedNoteKeySet,
          automationKeyframeSelectionKeys: selectedAutomationKeyframeSet
        },
        beatRange: noteSelectionBeatRange,
        label: noteSelectionTrackLabel,
        markerTrackId:
          editorSelection.actionScopePreview === "all-tracks"
            ? (project.tracks[0]?.id ?? noteSelectionSourceTrackId)
            : noteSelectionSourceTrackId
      };
    }
    return { kind: "none" };
  }, [
    noteSelectionBeatRange,
    noteSelectionTrackLabel,
    noteSelectionSourceTrackId,
    project.tracks,
    selectedAutomationKeyframeSet,
    selectedNoteKeySet,
    editorSelection
  ]);
  const selectionBeatRange = canvasSelection.kind === "none" ? null : canvasSelection.beatRange;

  return {
    selectedContent,
    noteSelectionSourceTrackId,
    hasTimelineRangeSelection,
    canvasSelection,
    selectionBeatRange
  };
}

interface UseAppSelectionEffectsOptions {
  project: Project;
  editorSelection: EditorSelectionState;
  setEditorSelection: Dispatch<SetStateAction<EditorSelectionState>>;
  pitchPicker: ReturnType<typeof useComposerTransientUi>["pitchPicker"];
  canvasSelection: TrackCanvasSelection;
  noteSelectionSourceTrackId: ReturnType<typeof useAppSelectionModel>["noteSelectionSourceTrackId"];
  selectionBeatRange: ReturnType<typeof useAppSelectionModel>["selectionBeatRange"];
  setSelectedTrackId: Dispatch<SetStateAction<string | undefined>>;
  setSelectionActionPopoverMode: ReturnType<typeof useComposerTransientUi>["setSelectionActionPopoverMode"];
  keepSelectionPopoverCollapsedRef: RefObject<boolean>;
  selectedContent: ContentSelection;
}

export function useAppSelectionEffects({
  project,
  editorSelection,
  setEditorSelection,
  pitchPicker,
  canvasSelection,
  noteSelectionSourceTrackId,
  selectionBeatRange,
  setSelectedTrackId,
  setSelectionActionPopoverMode,
  keepSelectionPopoverCollapsedRef,
  selectedContent
}: UseAppSelectionEffectsOptions) {
  useEffect(() => {
    setEditorSelection((current) => filterEditorSelectionToProject(project, current));
  }, [project, setEditorSelection]);

  useEffect(() => {
    if (
      !noteSelectionSourceTrackId ||
      editorSelection.marqueeActive ||
      pitchPicker ||
      canvasSelection.kind === "timeline"
    ) {
      return;
    }
    setSelectedTrackId((current) => (current === noteSelectionSourceTrackId ? current : noteSelectionSourceTrackId));
  }, [
    canvasSelection.kind,
    editorSelection.marqueeActive,
    noteSelectionSourceTrackId,
    pitchPicker,
    setSelectedTrackId
  ]);

  useEffect(() => {
    if (!selectionBeatRange) {
      setSelectionActionPopoverMode("expanded");
      setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "source"));
    }
  }, [selectionBeatRange, setSelectionActionPopoverMode, setEditorSelection]);

  useEffect(() => {
    if (keepSelectionPopoverCollapsedRef.current) {
      keepSelectionPopoverCollapsedRef.current = false;
      return;
    }
    setSelectionActionPopoverMode("expanded");
  }, [selectedContent, setSelectionActionPopoverMode, keepSelectionPopoverCollapsedRef]);

  useEffect(() => {
    if (editorSelection.kind !== "timeline") {
      return;
    }
    setSelectionActionPopoverMode("expanded");
  }, [editorSelection.kind, setSelectionActionPopoverMode]);

  useEffect(() => {
    if (canvasSelection.kind === "timeline") {
      setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "all-tracks"));
      return;
    }
    setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "source"));
  }, [canvasSelection.kind, noteSelectionSourceTrackId, setEditorSelection]);
}
