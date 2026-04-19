import { eraseNotesInBeatRange, sortNotes } from "@/lib/noteEditing";
import { DEFAULT_NOTE_VELOCITY } from "@/lib/noteDefaults";
import { Note, Track } from "@/types/music";

const NOTE_AT_BEAT_EPSILON = 1e-9;

export const KEYBOARD_NOTE_PREVIEW_MIN_PITCH = "C1";
export const KEYBOARD_NOTE_PREVIEW_MAX_PITCH = "C7";

export const trackHasNoteAtBeat = (track: Track | undefined, beat: number): boolean =>
  Boolean(
    track?.notes.some(
      (note) => note.startBeat <= beat + NOTE_AT_BEAT_EPSILON && note.startBeat + note.durationBeats > beat + NOTE_AT_BEAT_EPSILON
    )
  );

export const upsertKeyboardPlacedNote = (track: Track, note: Pick<Note, "id" | "pitchStr" | "startBeat" | "durationBeats">): Track => {
  const overwrittenNotes = eraseNotesInBeatRange(
    track.notes,
    note.startBeat,
    note.startBeat + note.durationBeats,
    new Set([note.id])
  );
  const placedNote: Note = {
    ...note,
    velocity: DEFAULT_NOTE_VELOCITY
  };
  const existingIndex = overwrittenNotes.findIndex((entry) => entry.id === placedNote.id);
  const nextNotes =
    existingIndex === -1
      ? sortNotes([...overwrittenNotes, placedNote])
      : sortNotes(overwrittenNotes.map((entry) => (entry.id === placedNote.id ? placedNote : entry)));

  if (
    nextNotes.length === track.notes.length &&
    nextNotes.every((entry, index) => {
      const previous = track.notes[index];
      return (
        previous?.id === entry.id &&
        previous.pitchStr === entry.pitchStr &&
        previous.startBeat === entry.startBeat &&
        previous.durationBeats === entry.durationBeats &&
        previous.velocity === entry.velocity
      );
    })
  ) {
    return track;
  }

  return {
    ...track,
    notes: nextNotes
  };
};
