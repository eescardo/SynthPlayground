import { createId } from "@/lib/ids";
import { Note } from "@/types/music";

export const DEFAULT_NOTE_PITCH = "C4";
export const DEFAULT_NOTE_VELOCITY = 0.85;
export const DEFAULT_PLACED_NOTE_GRID_SPAN = 2;

export function createDefaultPlacedNote(startBeat: number, gridBeats: number, pitchStr = DEFAULT_NOTE_PITCH): Note {
  return {
    id: createId("note"),
    pitchStr,
    startBeat,
    durationBeats: Math.max(gridBeats, gridBeats * DEFAULT_PLACED_NOTE_GRID_SPAN),
    velocity: DEFAULT_NOTE_VELOCITY
  };
}
