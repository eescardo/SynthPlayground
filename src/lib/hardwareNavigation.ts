import { sortAutomationKeyframes } from "@/lib/automationTimelineEditing";
import {
  ContentSelection,
  parseAutomationSelectionKey,
  parseNoteSelectionKey,
  getNoteSelectionKey
} from "@/lib/clipboard";
import { eraseNotesInBeatRange, sortNotes } from "@/lib/noteEditing";
import { DEFAULT_NOTE_VELOCITY } from "@/lib/noteDefaults";
import { Note, Project, Track, TrackMacroAutomationKeyframe } from "@/types/music";

const NOTE_AT_BEAT_EPSILON = 1e-9;

export const KEYBOARD_NOTE_PREVIEW_MIN_PITCH = "C1";
export const KEYBOARD_NOTE_PREVIEW_MAX_PITCH = "C7";

const noteContainsBeat = (note: Note, beat: number) =>
  note.startBeat <= beat + NOTE_AT_BEAT_EPSILON && note.startBeat + note.durationBeats > beat + NOTE_AT_BEAT_EPSILON;

const notesOverlap = (left: Pick<Note, "id" | "startBeat" | "durationBeats">, right: Pick<Note, "id" | "startBeat" | "durationBeats">) => {
  const leftEndBeat = left.startBeat + left.durationBeats;
  const rightEndBeat = right.startBeat + right.durationBeats;
  return left.startBeat < rightEndBeat - NOTE_AT_BEAT_EPSILON && leftEndBeat > right.startBeat + NOTE_AT_BEAT_EPSILON;
};

export const trackHasNoteAtBeat = (track: Track | undefined, beat: number): boolean =>
  Boolean(
    track?.notes.some((note) => noteContainsBeat(note, beat))
  );

export const findTrackNoteAtBeat = (track: Track | undefined, beat: number): Note | null =>
  track?.notes.find((note) => noteContainsBeat(note, beat)) ?? null;

export const findTrackBackspaceTargetNote = (track: Track | undefined, beat: number): Note | null => {
  if (!track) {
    return null;
  }

  const endingNote =
    track.notes.find((note) => Math.abs(note.startBeat + note.durationBeats - beat) <= NOTE_AT_BEAT_EPSILON) ?? null;
  if (endingNote) {
    return endingNote;
  }

  return findTrackNoteAtBeat(track, beat);
};

type SelectionShiftBlock =
  | { reason: "boundary" }
  | { reason: "note"; blockingSelectionKey: string };

export type ShiftContentSelectionResult =
  | {
      status: "moved";
      project: Project;
    }
  | {
      status: "blocked";
      block: SelectionShiftBlock;
    };

const shiftAutomationKeyframe = (keyframe: TrackMacroAutomationKeyframe, deltaBeats: number): TrackMacroAutomationKeyframe => ({
  ...keyframe,
  beat: keyframe.beat + deltaBeats
});

export const shiftContentSelectionByBeats = (
  project: Project,
  selection: ContentSelection,
  deltaBeats: number
): ShiftContentSelectionResult => {
  if (
    deltaBeats === 0 ||
    (selection.noteKeys.length === 0 && selection.automationKeyframeSelectionKeys.length === 0)
  ) {
    return {
      status: "moved",
      project
    };
  }

  const selectedNoteIdsByTrackId = new Map<string, Set<string>>();
  for (const selectionKey of selection.noteKeys) {
    const parsed = parseNoteSelectionKey(selectionKey);
    if (!parsed) {
      continue;
    }
    const selectedIds = selectedNoteIdsByTrackId.get(parsed.trackId) ?? new Set<string>();
    selectedIds.add(parsed.noteId);
    selectedNoteIdsByTrackId.set(parsed.trackId, selectedIds);
  }

  const selectedAutomationIdsByTrackId = new Map<string, Map<string, Set<string>>>();
  for (const selectionKey of selection.automationKeyframeSelectionKeys) {
    const parsed = parseAutomationSelectionKey(selectionKey);
    if (!parsed) {
      continue;
    }
    const laneSelections = selectedAutomationIdsByTrackId.get(parsed.trackId) ?? new Map<string, Set<string>>();
    const keyframeIds = laneSelections.get(parsed.macroId) ?? new Set<string>();
    keyframeIds.add(parsed.keyframeId);
    laneSelections.set(parsed.macroId, keyframeIds);
    selectedAutomationIdsByTrackId.set(parsed.trackId, laneSelections);
  }

  for (const track of project.tracks) {
    const selectedNoteIds = selectedNoteIdsByTrackId.get(track.id);
    if (selectedNoteIds) {
      const movedNotes = track.notes
        .filter((note) => selectedNoteIds.has(note.id))
        .map((note) => ({ ...note, startBeat: note.startBeat + deltaBeats }));

      if (movedNotes.some((note) => note.startBeat < -NOTE_AT_BEAT_EPSILON)) {
        return {
          status: "blocked",
          block: { reason: "boundary" }
        };
      }

      const blockingNote = track.notes
        .filter((note) => !selectedNoteIds.has(note.id))
        .find((note) => movedNotes.some((movedNote) => notesOverlap(movedNote, note)));
      if (blockingNote) {
        return {
          status: "blocked",
          block: {
            reason: "note",
            blockingSelectionKey: getNoteSelectionKey(track.id, blockingNote.id)
          }
        };
      }
    }

    const selectedAutomationIdsByMacroId = selectedAutomationIdsByTrackId.get(track.id);
    if (!selectedAutomationIdsByMacroId) {
      continue;
    }

    for (const [macroId, keyframeIds] of selectedAutomationIdsByMacroId) {
      const lane = track.macroAutomations[macroId];
      if (!lane) {
        continue;
      }
      const movesOutOfBounds = lane.keyframes.some(
        (keyframe) => keyframeIds.has(keyframe.id) && keyframe.beat + deltaBeats < -NOTE_AT_BEAT_EPSILON
      );
      if (movesOutOfBounds) {
        return {
          status: "blocked",
          block: { reason: "boundary" }
        };
      }
    }
  }

  return {
    status: "moved",
    project: {
      ...project,
      tracks: project.tracks.map((track) => {
        const selectedNoteIds = selectedNoteIdsByTrackId.get(track.id);
        const selectedAutomationIdsByMacroId = selectedAutomationIdsByTrackId.get(track.id);

        const nextNotes = selectedNoteIds
          ? sortNotes(
              track.notes.map((note) =>
                selectedNoteIds.has(note.id)
                  ? { ...note, startBeat: note.startBeat + deltaBeats }
                  : note
              )
            )
          : track.notes;

        const nextMacroAutomations = selectedAutomationIdsByMacroId
          ? Object.fromEntries(
              Object.entries(track.macroAutomations).map(([macroId, lane]) => {
                const selectedKeyframeIds = selectedAutomationIdsByMacroId.get(macroId);
                if (!selectedKeyframeIds) {
                  return [macroId, lane];
                }
                return [
                  macroId,
                  {
                    ...lane,
                    keyframes: sortAutomationKeyframes(
                      lane.keyframes.map((keyframe) =>
                        selectedKeyframeIds.has(keyframe.id)
                          ? shiftAutomationKeyframe(keyframe, deltaBeats)
                          : keyframe
                      )
                    )
                  }
                ];
              })
            )
          : track.macroAutomations;

        if (nextNotes === track.notes && nextMacroAutomations === track.macroAutomations) {
          return track;
        }

        return {
          ...track,
          notes: nextNotes,
          macroAutomations: nextMacroAutomations
        };
      })
    }
  };
};

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
