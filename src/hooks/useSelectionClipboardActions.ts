"use client";

import { useCallback } from "react";
import {
  applyNoteClipboardInsert,
  applyNoteClipboardInsertAllTracks,
  applyNoteClipboardPaste as applyNoteClipboardPasteToProject,
  BeatRange,
  buildAllTracksClipboardPayload,
  buildNoteClipboardPayload,
  ContentSelection,
  cutBeatRangeAcrossAllTracks,
  deleteSelectedAutomationKeyframes,
  EMPTY_CONTENT_SELECTION,
  eraseAutomationInRangeForTracks,
  NoteClipboardPayload,
  parseNoteSelectionKey
} from "@/lib/clipboard";
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
  contentSelection: ContentSelection;
  noteClipboardPayload: NoteClipboardPayload | null;
  project: Project;
  selectedTrackId?: string;
  selectionBeatRange: BeatRange | null;
  setPlayheadFromUser: (beat: number) => void;
  setContentSelection: (selection: ContentSelection) => void;
  writeClipboardPayload: (payload: NoteClipboardPayload) => Promise<void>;
}

export function useSelectionClipboardActions({
  clearNoteClipboard,
  closeTimelineActionsPopover,
  commitProjectChange,
  contentSelection,
  noteClipboardPayload,
  project,
  selectedTrackId,
  selectionBeatRange,
  setPlayheadFromUser,
  setContentSelection,
  writeClipboardPayload
}: UseSelectionClipboardActionsParams) {
  const deleteSelectedNotes = useCallback((
    selection: ContentSelection,
    options?: { eraseAutomationRange?: BeatRange }
  ) => {
    if (selection.noteKeys.length === 0 && selection.automationKeyframeSelectionKeys.length === 0) {
      return;
    }

    const noteIdsByTrackId = new Map<string, Set<string>>();
    for (const selectionKey of selection.noteKeys) {
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

        if (selection.automationKeyframeSelectionKeys.length > 0) {
          nextProject = deleteSelectedAutomationKeyframes(nextProject, selection.automationKeyframeSelectionKeys);
        }

        return nextProject;
      },
      { actionKey: "notes:cut-selection" }
    );
    setContentSelection(EMPTY_CONTENT_SELECTION);
  }, [commitProjectChange, setContentSelection]);

  const copySelectedNotes = useCallback(async () => {
    const payload = buildNoteClipboardPayload(project, contentSelection.noteKeys, contentSelection.automationKeyframeSelectionKeys);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
  }, [contentSelection.automationKeyframeSelectionKeys, contentSelection.noteKeys, project, writeClipboardPayload]);

  const cutSelectedNotes = useCallback(async () => {
    const payload = buildNoteClipboardPayload(project, contentSelection.noteKeys, contentSelection.automationKeyframeSelectionKeys);
    if (!payload) {
      return;
    }
    await writeClipboardPayload(payload);
    deleteSelectedNotes(
      contentSelection,
      contentSelection.noteKeys.length > 0 && selectionBeatRange ? { eraseAutomationRange: selectionBeatRange } : undefined
    );
  }, [contentSelection, deleteSelectedNotes, project, selectionBeatRange, writeClipboardPayload]);

  const deleteSelectedNoteSelection = useCallback(() => {
    deleteSelectedNotes(contentSelection);
  }, [contentSelection, deleteSelectedNotes]);

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
    setContentSelection(EMPTY_CONTENT_SELECTION);
  }, [commitProjectChange, project, selectionBeatRange, setContentSelection, writeClipboardPayload]);

  const deleteAllTracksInSelection = useCallback(() => {
    if (!selectionBeatRange) {
      return;
    }
    void clearNoteClipboard();
    commitProjectChange((current) => cutBeatRangeAcrossAllTracks(current, selectionBeatRange), {
      actionKey: "timeline:delete-all-tracks"
    });
    setContentSelection(EMPTY_CONTENT_SELECTION);
  }, [clearNoteClipboard, commitProjectChange, selectionBeatRange, setContentSelection]);

  const applyNoteClipboardPaste = useCallback((pasteAction: NoteClipboardPasteAction, beat: number) => {
    if (!noteClipboardPayload || !selectedTrackId) {
      return;
    }

    let nextSelection = EMPTY_CONTENT_SELECTION;
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
        nextSelection = applied.selection;
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
    setContentSelection(nextSelection);
    closeTimelineActionsPopover();
  }, [
    closeTimelineActionsPopover,
    commitProjectChange,
    noteClipboardPayload,
    selectedTrackId,
    setContentSelection,
    setPlayheadFromUser
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
