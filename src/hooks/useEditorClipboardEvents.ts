"use client";

import { useEffect } from "react";
import {
  applyNoteClipboardPaste,
  buildAllTracksClipboardPayload,
  buildNoteClipboardPayload,
  parseNoteClipboardPayload,
  serializeNoteClipboardPayload
} from "@/lib/noteClipboard";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean }
) => void;

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "SELECT" || element.tagName === "TEXTAREA"));
};

interface UseEditorClipboardEventsParams {
  commitProjectChange: CommitProjectChange;
  cutAllTracksInSelection: () => Promise<void>;
  deleteSelectedNotes: (noteSelectionKeys: string[], automationSelectionKeys?: string[]) => void;
  hasTimelineRangeSelection: boolean;
  playheadBeat: number;
  project: Project;
  selectedAutomationKeyframeKeys: string[];
  selectedNoteKeys: string[];
  selectionBeatRange: { startBeat: number; endBeat: number; beatSpan: number } | null;
  selectedTrackId?: string;
  setNoteClipboardPayload: (payload: ReturnType<typeof parseNoteClipboardPayload>) => void;
  setSelectedAutomationKeyframeKeys: (selectionKeys: string[]) => void;
  setSelectedNoteKeys: (selectionKeys: string[]) => void;
}

export function useEditorClipboardEvents({
  commitProjectChange,
  cutAllTracksInSelection,
  deleteSelectedNotes,
  hasTimelineRangeSelection,
  playheadBeat,
  project,
  selectedAutomationKeyframeKeys,
  selectedNoteKeys,
  selectionBeatRange,
  selectedTrackId,
  setNoteClipboardPayload,
  setSelectedAutomationKeyframeKeys,
  setSelectedNoteKeys
}: UseEditorClipboardEventsParams) {
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target) || !event.clipboardData) {
        return;
      }

      const payload = hasTimelineRangeSelection && selectionBeatRange
        ? buildAllTracksClipboardPayload(project, selectionBeatRange)
        : buildNoteClipboardPayload(project, selectedNoteKeys, selectedAutomationKeyframeKeys);
      if (!payload) {
        return;
      }

      setNoteClipboardPayload(payload);
      const serialized = serializeNoteClipboardPayload(payload);
      event.preventDefault();
      event.clipboardData.setData("text/plain", serialized.plainText);
      event.clipboardData.setData("text/html", serialized.html);
    };

    const onCut = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target) || !event.clipboardData) {
        return;
      }

      const payload = hasTimelineRangeSelection && selectionBeatRange
        ? buildAllTracksClipboardPayload(project, selectionBeatRange)
        : buildNoteClipboardPayload(project, selectedNoteKeys, selectedAutomationKeyframeKeys);
      if (!payload) {
        return;
      }

      setNoteClipboardPayload(payload);
      const serialized = serializeNoteClipboardPayload(payload);
      event.preventDefault();
      event.clipboardData.setData("text/plain", serialized.plainText);
      event.clipboardData.setData("text/html", serialized.html);
      if (hasTimelineRangeSelection) {
        void cutAllTracksInSelection();
      } else {
        deleteSelectedNotes(selectedNoteKeys, selectedAutomationKeyframeKeys);
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target) || !selectedTrackId || !event.clipboardData) {
        return;
      }

      const payload = parseNoteClipboardPayload(
        event.clipboardData.getData("text/html"),
        event.clipboardData.getData("text/plain")
      );
      if (!payload) {
        return;
      }

      let nextSelectionKeys: string[] = [];
      setNoteClipboardPayload(payload);
      event.preventDefault();
      commitProjectChange((current) => {
        const applied = applyNoteClipboardPaste(current, payload, selectedTrackId, playheadBeat);
        nextSelectionKeys = applied.selectionKeys;
        return applied.project;
      }, { actionKey: `track:${selectedTrackId}:paste-notes` });
      setSelectedNoteKeys(nextSelectionKeys);
      setSelectedAutomationKeyframeKeys([]);
    };

    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
    };
  }, [
    commitProjectChange,
    cutAllTracksInSelection,
    deleteSelectedNotes,
    hasTimelineRangeSelection,
    playheadBeat,
    project,
    selectedAutomationKeyframeKeys,
    selectedNoteKeys,
    selectionBeatRange,
    selectedTrackId,
    setNoteClipboardPayload,
    setSelectedAutomationKeyframeKeys,
    setSelectedNoteKeys
  ]);
}
