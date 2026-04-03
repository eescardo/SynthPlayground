import { createId } from "@/lib/ids";
import { Note } from "@/types/music";

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

  return nextNotes
    .filter((note) => note.durationBeats > 0)
    .sort((a, b) => a.startBeat - b.startBeat);
}
