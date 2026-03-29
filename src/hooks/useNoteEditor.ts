"use client";

import { useCallback } from "react";
import { Note, Project } from "@/types/music";

const notesOverlap = (a: Note, b: Note): boolean => {
  const epsilon = 1e-9;
  const aEnd = a.startBeat + a.durationBeats;
  const bEnd = b.startBeat + b.durationBeats;
  return a.startBeat < bEnd - epsilon && aEnd > b.startBeat + epsilon;
};

const hasOverlapWithOthers = (candidate: Note, notes: Note[]): boolean =>
  notes.some((other) => other.id !== candidate.id && notesOverlap(candidate, other));

interface UseNoteEditorArgs {
  commitProjectChange: (updater: (current: Project) => Project, options?: { actionKey?: string; coalesce?: boolean }) => void;
}

export function useNoteEditor({ commitProjectChange }: UseNoteEditorArgs) {
  const upsertNote = useCallback((trackId: string, note: Note, options?: { actionKey?: string; coalesce?: boolean }) => {
    commitProjectChange(
      (current) => {
        let changed = false;
        const tracks = current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const existing = track.notes.find((entry) => entry.id === note.id);
          let nextNotes = track.notes;
          if (existing) {
            if (hasOverlapWithOthers(note, track.notes)) {
              return track;
            }
            nextNotes = track.notes.map((entry) => (entry.id === note.id ? note : entry));
          } else {
            if (hasOverlapWithOthers(note, track.notes)) {
              return track;
            }
            nextNotes = [...track.notes, note].sort((a, b) => a.startBeat - b.startBeat);
          }
          if (nextNotes === track.notes) {
            return track;
          }
          changed = true;
          return { ...track, notes: nextNotes };
        });
        return changed ? { ...current, tracks } : current;
      },
      options
    );
  }, [commitProjectChange]);

  const updateNote = useCallback((trackId: string, noteId: string, patch: Partial<Note>, options?: { actionKey?: string; coalesce?: boolean }) => {
    commitProjectChange(
      (current) => {
        let changed = false;
        const tracks = current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const nextNotes = track.notes.map((note) => {
            if (note.id !== noteId) {
              return note;
            }
            const nextNote = { ...note, ...patch };
            if (hasOverlapWithOthers(nextNote, track.notes)) {
              return note;
            }
            if (
              nextNote.pitchStr === note.pitchStr &&
              nextNote.startBeat === note.startBeat &&
              nextNote.durationBeats === note.durationBeats &&
              nextNote.velocity === note.velocity
            ) {
              return note;
            }
            changed = true;
            return nextNote;
          });
          return changed ? { ...track, notes: nextNotes } : track;
        });
        return changed ? { ...current, tracks } : current;
      },
      options
    );
  }, [commitProjectChange]);

  const deleteNote = useCallback((trackId: string, noteId: string) => {
    commitProjectChange((current) => {
      let changed = false;
      const tracks = current.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }
        const nextNotes = track.notes.filter((note) => note.id !== noteId);
        if (nextNotes.length === track.notes.length) {
          return track;
        }
        changed = true;
        return { ...track, notes: nextNotes };
      });
      return changed ? { ...current, tracks } : current;
    }, { actionKey: `track:${trackId}:delete-note:${noteId}` });
  }, [commitProjectChange]);

  return { upsertNote, updateNote, deleteNote };
}
