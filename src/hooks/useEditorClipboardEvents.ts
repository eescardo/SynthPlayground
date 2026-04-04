"use client";

import { useEffect } from "react";
import {
  applyNoteClipboardPaste,
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
  deleteSelectedNotes: (selectionKeys: string[]) => void;
  playheadBeat: number;
  project: Project;
  selectedNoteKeys: string[];
  selectedTrackId?: string;
  setCompatibleClipboardPayload: (payload: ReturnType<typeof parseNoteClipboardPayload>) => void;
  setSelectedNoteKeys: (selectionKeys: string[]) => void;
}

export function useEditorClipboardEvents({
  commitProjectChange,
  deleteSelectedNotes,
  playheadBeat,
  project,
  selectedNoteKeys,
  selectedTrackId,
  setCompatibleClipboardPayload,
  setSelectedNoteKeys
}: UseEditorClipboardEventsParams) {
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target) || selectedNoteKeys.length === 0 || !event.clipboardData) {
        return;
      }

      const payload = buildNoteClipboardPayload(project, selectedNoteKeys);
      if (!payload) {
        return;
      }

      setCompatibleClipboardPayload(payload);
      const serialized = serializeNoteClipboardPayload(payload);
      event.preventDefault();
      event.clipboardData.setData("text/plain", serialized.plainText);
      event.clipboardData.setData("text/html", serialized.html);
    };

    const onCut = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target) || selectedNoteKeys.length === 0 || !event.clipboardData) {
        return;
      }

      const payload = buildNoteClipboardPayload(project, selectedNoteKeys);
      if (!payload) {
        return;
      }

      setCompatibleClipboardPayload(payload);
      const serialized = serializeNoteClipboardPayload(payload);
      event.preventDefault();
      event.clipboardData.setData("text/plain", serialized.plainText);
      event.clipboardData.setData("text/html", serialized.html);
      deleteSelectedNotes(selectedNoteKeys);
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
      setCompatibleClipboardPayload(payload);
      event.preventDefault();
      commitProjectChange((current) => {
        const applied = applyNoteClipboardPaste(current, payload, selectedTrackId, playheadBeat);
        nextSelectionKeys = applied.selectionKeys;
        return applied.project;
      }, { actionKey: `track:${selectedTrackId}:paste-notes` });
      setSelectedNoteKeys(nextSelectionKeys);
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
    deleteSelectedNotes,
    playheadBeat,
    project,
    selectedNoteKeys,
    selectedTrackId,
    setCompatibleClipboardPayload,
    setSelectedNoteKeys
  ]);
}
