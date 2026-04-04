"use client";

import { useCallback } from "react";
import {
  applyNoteClipboardInsert,
  applyNoteClipboardInsertAllTracks,
  applyNoteClipboardPaste,
  BeatRange,
  buildAllTracksClipboardPayload,
  buildNoteClipboardPayload,
  cutBeatRangeAcrossAllTracks,
  NoteClipboardPayload,
  parseNoteSelectionKey
} from "@/lib/noteClipboard";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean }
) => void;

interface UseSelectionClipboardActionsParams {
  clearNoteClipboard: () => Promise<void>;
  closeTimelineActionsPopover: () => void;
  commitProjectChange: CommitProjectChange;
  noteClipboardPayload: NoteClipboardPayload | null;
  project: Project;
  selectedNoteKeys: string[];
  selectedTrackId?: string;
  selectionBeatRange: BeatRange | null;
  setPlayheadFromUser: (beat: number) => void;
  setSelectedNoteKeys: (selectionKeys: string[]) => void;
  writeClipboardPayload: (payload: NoteClipboardPayload) => Promise<void>;
}

export function useSelectionClipboardActions({
  clearNoteClipboard,
  closeTimelineActionsPopover,
  commitProjectChange,
  noteClipboardPayload,
  project,
  selectedNoteKeys,
  selectedTrackId,
  selectionBeatRange,
  setPlayheadFromUser,
  setSelectedNoteKeys,
  writeClipboardPayload
}: UseSelectionClipboardActionsParams) {
  const deleteSelectedNotes = useCallback((selectionKeys: string[]) => {
    if (selectionKeys.length === 0) {
      return;
    }

    const noteIdsByTrackId = new Map<string, Set<string>>();
    for (const selectionKey of selectionKeys) {
      const parsed = parseNoteSelectionKey(selectionKey);
      if (!parsed) {
        continue;
      }
      const noteIds = noteIdsByTrackId.get(parsed.trackId) ?? new Set<string>();
      noteIds.add(parsed.noteId);
      noteIdsByTrackId.set(parsed.trackId, noteIds);
    }

    if (noteIdsByTrackId.size === 0) {
      return;
    }

    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => {
          const noteIds = noteIdsByTrackId.get(track.id);
          if (!noteIds) {
            return track;
          }
          const nextNotes = track.notes.filter((note) => !noteIds.has(note.id));
          return nextNotes.length === track.notes.length ? track : { ...track, notes: nextNotes };
        })
      }),
      { actionKey: "notes:cut-selection" }
    );
    setSelectedNoteKeys([]);
  }, [commitProjectChange, setSelectedNoteKeys]);

  const copySelectedNotes = useCallback(async () => {
    const payload = buildNoteClipboardPayload(project, selectedNoteKeys);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
  }, [project, selectedNoteKeys, writeClipboardPayload]);

  const cutSelectedNotes = useCallback(async () => {
    const payload = buildNoteClipboardPayload(project, selectedNoteKeys);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
    deleteSelectedNotes(selectedNoteKeys);
  }, [deleteSelectedNotes, project, selectedNoteKeys, writeClipboardPayload]);

  const deleteSelectedNoteSelection = useCallback(() => {
    deleteSelectedNotes(selectedNoteKeys);
  }, [deleteSelectedNotes, selectedNoteKeys]);

  const copyAllTracksInSelection = useCallback(async () => {
    if (!selectionBeatRange) {
      return;
    }
    const payload = buildAllTracksClipboardPayload(project, selectionBeatRange);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
  }, [project, selectionBeatRange, writeClipboardPayload]);

  const cutAllTracksInSelection = useCallback(async () => {
    if (!selectionBeatRange) {
      return;
    }
    const payload = buildAllTracksClipboardPayload(project, selectionBeatRange);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
    commitProjectChange((current) => cutBeatRangeAcrossAllTracks(current, selectionBeatRange), {
      actionKey: "timeline:cut-all-tracks"
    });
    setSelectedNoteKeys([]);
  }, [commitProjectChange, project, selectionBeatRange, setSelectedNoteKeys, writeClipboardPayload]);

  const deleteAllTracksInSelection = useCallback(() => {
    if (!selectionBeatRange) {
      return;
    }
    void clearNoteClipboard();
    commitProjectChange((current) => cutBeatRangeAcrossAllTracks(current, selectionBeatRange), {
      actionKey: "timeline:delete-all-tracks"
    });
    setSelectedNoteKeys([]);
  }, [clearNoteClipboard, commitProjectChange, selectionBeatRange, setSelectedNoteKeys]);

  const applyCompatiblePaste = useCallback((mode: "paste" | "paste-all-tracks" | "insert" | "insert-all-tracks", beat: number) => {
    if (!noteClipboardPayload || !selectedTrackId) {
      return;
    }

    let nextSelectionKeys: string[] = [];
    commitProjectChange(
      (current) => {
        const firstTrackId = current.tracks[0]?.id;
        const applied =
          mode === "insert"
            ? applyNoteClipboardInsert(current, noteClipboardPayload, selectedTrackId, beat)
            : mode === "paste-all-tracks" && firstTrackId
              ? applyNoteClipboardPaste(current, noteClipboardPayload, firstTrackId, beat)
              : mode === "insert-all-tracks"
                ? applyNoteClipboardInsertAllTracks(current, noteClipboardPayload, beat)
                : applyNoteClipboardPaste(current, noteClipboardPayload, selectedTrackId, beat);
        nextSelectionKeys = applied.selectionKeys;
        return applied.project;
      },
      {
        actionKey:
          mode === "insert"
            ? `track:${selectedTrackId}:insert-notes`
            : mode === "paste-all-tracks"
              ? "timeline:paste-all-tracks"
              : mode === "insert-all-tracks"
                ? "timeline:insert-all-tracks"
                : `track:${selectedTrackId}:paste-notes`
      }
    );
    setPlayheadFromUser(beat);
    setSelectedNoteKeys(nextSelectionKeys);
    closeTimelineActionsPopover();
  }, [
    closeTimelineActionsPopover,
    commitProjectChange,
    noteClipboardPayload,
    selectedTrackId,
    setPlayheadFromUser,
    setSelectedNoteKeys
  ]);

  return {
    applyCompatiblePaste,
    copyAllTracksInSelection,
    copySelectedNotes,
    cutAllTracksInSelection,
    cutSelectedNotes,
    deleteAllTracksInSelection,
    deleteSelectedNoteSelection,
    deleteSelectedNotes
  };
}
