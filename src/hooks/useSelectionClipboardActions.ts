"use client";

import { useCallback } from "react";
import {
  applyNoteClipboardInsert,
  applyNoteClipboardInsertAllTracks,
  applyNoteClipboardPaste as applyNoteClipboardPasteToProject,
  BeatRange,
  buildAllTracksClipboardPayload,
  buildNoteClipboardPayload,
  cutBeatRangeAcrossAllTracks,
  deleteSelectedAutomationKeyframes,
  eraseAutomationInRangeForTracks,
  NoteClipboardPayload,
  parseNoteSelectionKey
} from "@/lib/noteClipboard";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean }
) => void;

export type NoteClipboardPasteAction = "paste" | "paste-all-tracks" | "insert" | "insert-all-tracks";

interface UseSelectionClipboardActionsParams {
  clearNoteClipboard: () => Promise<void>;
  closeTimelineActionsPopover: () => void;
  commitProjectChange: CommitProjectChange;
  noteClipboardPayload: NoteClipboardPayload | null;
  project: Project;
  selectedAutomationKeyframeKeys: string[];
  selectedNoteKeys: string[];
  selectedTrackId?: string;
  selectionBeatRange: BeatRange | null;
  setPlayheadFromUser: (beat: number) => void;
  setSelectedAutomationKeyframeKeys: (selectionKeys: string[]) => void;
  setSelectedNoteKeys: (selectionKeys: string[]) => void;
  writeClipboardPayload: (payload: NoteClipboardPayload) => Promise<void>;
}

export function useSelectionClipboardActions({
  clearNoteClipboard,
  closeTimelineActionsPopover,
  commitProjectChange,
  noteClipboardPayload,
  project,
  selectedAutomationKeyframeKeys,
  selectedNoteKeys,
  selectedTrackId,
  selectionBeatRange,
  setPlayheadFromUser,
  setSelectedAutomationKeyframeKeys,
  setSelectedNoteKeys,
  writeClipboardPayload
}: UseSelectionClipboardActionsParams) {
  const deleteSelectedNotes = useCallback((
    noteSelectionKeys: string[],
    automationSelectionKeys: string[] = [],
    options?: { eraseAutomationRange?: BeatRange }
  ) => {
    if (noteSelectionKeys.length === 0 && automationSelectionKeys.length === 0) {
      return;
    }

    const noteIdsByTrackId = new Map<string, Set<string>>();
    for (const selectionKey of noteSelectionKeys) {
      const parsed = parseNoteSelectionKey(selectionKey);
      if (!parsed) {
        continue;
      }
      const noteIds = noteIdsByTrackId.get(parsed.trackId) ?? new Set<string>();
      noteIds.add(parsed.noteId);
      noteIdsByTrackId.set(parsed.trackId, noteIds);
    }

    commitProjectChange(
      (current) => {
        let nextProject = current;
        if (noteIdsByTrackId.size > 0) {
          nextProject = {
            ...nextProject,
            tracks: nextProject.tracks.map((track) => {
              const noteIds = noteIdsByTrackId.get(track.id);
              if (!noteIds) {
                return track;
              }
              const nextNotes = track.notes.filter((note) => !noteIds.has(note.id));
              return nextNotes.length === track.notes.length ? track : { ...track, notes: nextNotes };
            })
          };
        }

        if (options?.eraseAutomationRange && noteIdsByTrackId.size > 0) {
          nextProject = eraseAutomationInRangeForTracks(nextProject, options.eraseAutomationRange, noteIdsByTrackId.keys());
        }

        if (automationSelectionKeys.length > 0) {
          nextProject = deleteSelectedAutomationKeyframes(nextProject, automationSelectionKeys);
        }

        return nextProject;
      },
      { actionKey: "notes:cut-selection" }
    );
    setSelectedNoteKeys([]);
    setSelectedAutomationKeyframeKeys([]);
  }, [commitProjectChange, setSelectedAutomationKeyframeKeys, setSelectedNoteKeys]);

  const copySelectedNotes = useCallback(async () => {
    const payload = buildNoteClipboardPayload(project, selectedNoteKeys, selectedAutomationKeyframeKeys);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
  }, [project, selectedAutomationKeyframeKeys, selectedNoteKeys, writeClipboardPayload]);

  const cutSelectedNotes = useCallback(async () => {
    const payload = buildNoteClipboardPayload(project, selectedNoteKeys, selectedAutomationKeyframeKeys);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
    deleteSelectedNotes(
      selectedNoteKeys,
      selectedAutomationKeyframeKeys,
      selectedNoteKeys.length > 0 && selectionBeatRange ? { eraseAutomationRange: selectionBeatRange } : undefined
    );
  }, [deleteSelectedNotes, project, selectedAutomationKeyframeKeys, selectedNoteKeys, selectionBeatRange, writeClipboardPayload]);

  const deleteSelectedNoteSelection = useCallback(() => {
    deleteSelectedNotes(selectedNoteKeys, selectedAutomationKeyframeKeys);
  }, [deleteSelectedNotes, selectedAutomationKeyframeKeys, selectedNoteKeys]);

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
    setSelectedAutomationKeyframeKeys([]);
  }, [commitProjectChange, project, selectionBeatRange, setSelectedAutomationKeyframeKeys, setSelectedNoteKeys, writeClipboardPayload]);

  const deleteAllTracksInSelection = useCallback(() => {
    if (!selectionBeatRange) {
      return;
    }
    void clearNoteClipboard();
    commitProjectChange((current) => cutBeatRangeAcrossAllTracks(current, selectionBeatRange), {
      actionKey: "timeline:delete-all-tracks"
    });
    setSelectedNoteKeys([]);
    setSelectedAutomationKeyframeKeys([]);
  }, [clearNoteClipboard, commitProjectChange, selectionBeatRange, setSelectedAutomationKeyframeKeys, setSelectedNoteKeys]);

  const applyNoteClipboardPaste = useCallback((pasteAction: NoteClipboardPasteAction, beat: number) => {
    if (!noteClipboardPayload || !selectedTrackId) {
      return;
    }

    let nextSelectionKeys: string[] = [];
    commitProjectChange(
      (current) => {
        const firstTrackId = current.tracks[0]?.id;
        const applied =
          pasteAction === "insert"
            ? applyNoteClipboardInsert(current, noteClipboardPayload, selectedTrackId, beat)
            : pasteAction === "paste-all-tracks" && firstTrackId
              ? applyNoteClipboardPasteToProject(current, noteClipboardPayload, firstTrackId, beat)
              : pasteAction === "insert-all-tracks"
                ? applyNoteClipboardInsertAllTracks(current, noteClipboardPayload, beat)
                : applyNoteClipboardPasteToProject(current, noteClipboardPayload, selectedTrackId, beat);
        nextSelectionKeys = applied.selectionKeys;
        return applied.project;
      },
      {
        actionKey:
          pasteAction === "insert"
            ? `track:${selectedTrackId}:insert-notes`
            : pasteAction === "paste-all-tracks"
              ? "timeline:paste-all-tracks"
              : pasteAction === "insert-all-tracks"
                ? "timeline:insert-all-tracks"
                : `track:${selectedTrackId}:paste-notes`
      }
    );
    setPlayheadFromUser(beat);
    setSelectedNoteKeys(nextSelectionKeys);
    setSelectedAutomationKeyframeKeys([]);
    closeTimelineActionsPopover();
  }, [
    closeTimelineActionsPopover,
    commitProjectChange,
    noteClipboardPayload,
    selectedTrackId,
    setSelectedAutomationKeyframeKeys,
    setPlayheadFromUser,
    setSelectedNoteKeys
  ]);

  return {
    applyNoteClipboardPaste,
    copyAllTracksInSelection,
    copySelectedNotes,
    cutAllTracksInSelection,
    cutSelectedNotes,
    deleteAllTracksInSelection,
    deleteSelectedNoteSelection,
    deleteSelectedNotes
  };
}
