import { createId } from "@/lib/ids";
import { Note } from "@/types/music";

export interface BeatRange {
  startBeat: number;
  endBeat: number;
}

// Keep note arrays in ascending start-beat order so timeline rendering and editing code
// can assume a stable chronological sequence after splitting, trimming, or shifting notes.
export const sortNotes = (notes: Note[]) => notes.slice().sort((a, b) => a.startBeat - b.startBeat);

// Remove any note content that overlaps the given beat range while preserving content outside
// the range. Notes that cross the range boundary are trimmed or split into surviving pieces.
export function eraseNotesInBeatRange(
  notes: Note[],
  startBeat: number,
  endBeat: number,
  protectedNoteIds: ReadonlySet<string> = new Set<string>()
): Note[] {
  if (endBeat <= startBeat) {
    return notes;
  }

  const nextNotes: Note[] = [];
  for (const note of notes) {
    if (protectedNoteIds.has(note.id)) {
      nextNotes.push(note);
      continue;
    }

    const noteEnd = note.startBeat + note.durationBeats;
    if (noteEnd <= startBeat || note.startBeat >= endBeat) {
      nextNotes.push(note);
      continue;
    }

    if (note.startBeat < startBeat) {
      nextNotes.push({
        ...note,
        durationBeats: startBeat - note.startBeat
      });
    }

    if (noteEnd > endBeat) {
      nextNotes.push({
        ...note,
        id: createId("note"),
        startBeat: endBeat,
        durationBeats: noteEnd - endBeat
      });
    }
  }

  return nextNotes.filter((note) => note.durationBeats > 0).sort((a, b) => a.startBeat - b.startBeat);
}

// Return the portion of each note that lies inside the requested beat range.
// A note that partially overlaps the range is clipped to the window rather than discarded.
export function clipNotesToBeatRange(notes: Note[], startBeat: number, endBeat: number): Note[] {
  if (endBeat <= startBeat) {
    return [];
  }

  const nextNotes: Note[] = [];
  for (const note of notes) {
    const noteEnd = note.startBeat + note.durationBeats;
    const clippedStart = Math.max(note.startBeat, startBeat);
    const clippedEnd = Math.min(noteEnd, endBeat);
    if (clippedEnd <= clippedStart) {
      continue;
    }

    nextNotes.push({
      ...note,
      startBeat: clippedStart,
      durationBeats: clippedEnd - clippedStart
    });
  }

  return sortNotes(nextNotes);
}

// Delete the requested beat range from the timeline and pull everything to the right leftward
// to close the gap. Notes crossing the removed range are trimmed or split as needed.
export function removeBeatRangeAndCloseGap(notes: Note[], startBeat: number, endBeat: number): Note[] {
  if (endBeat <= startBeat) {
    return notes;
  }

  const gap = endBeat - startBeat;
  const nextNotes: Note[] = [];
  for (const note of notes) {
    const noteEnd = note.startBeat + note.durationBeats;

    if (noteEnd <= startBeat) {
      nextNotes.push(note);
      continue;
    }

    if (note.startBeat >= endBeat) {
      nextNotes.push({
        ...note,
        startBeat: note.startBeat - gap
      });
      continue;
    }

    if (note.startBeat < startBeat) {
      nextNotes.push({
        ...note,
        durationBeats: startBeat - note.startBeat
      });
    }

    if (noteEnd > endBeat) {
      nextNotes.push({
        ...note,
        id: createId("note"),
        startBeat,
        durationBeats: noteEnd - endBeat
      });
    }
  }

  return sortNotes(nextNotes.filter((note) => note.durationBeats > 0));
}

// Insert empty time into the timeline at the requested beat. Notes fully after the insertion
// point shift right, while notes crossing the insertion point are split around the gap.
export function insertBeatGap(notes: Note[], atBeat: number, gapBeats: number): Note[] {
  if (gapBeats <= 0) {
    return notes;
  }

  const nextNotes: Note[] = [];
  for (const note of notes) {
    const noteEnd = note.startBeat + note.durationBeats;

    if (noteEnd <= atBeat) {
      nextNotes.push(note);
      continue;
    }

    if (note.startBeat >= atBeat) {
      nextNotes.push({
        ...note,
        startBeat: note.startBeat + gapBeats
      });
      continue;
    }

    nextNotes.push({
      ...note,
      durationBeats: atBeat - note.startBeat
    });
    nextNotes.push({
      ...note,
      id: createId("note"),
      startBeat: atBeat + gapBeats,
      durationBeats: noteEnd - atBeat
    });
  }

  return sortNotes(nextNotes.filter((note) => note.durationBeats > 0));
}
