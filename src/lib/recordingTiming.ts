import { snapDownToGrid, snapToGrid } from "@/lib/musicTiming";

const RECORD_NOTE_START_LATE_SNAP_GRACE_MS = 80;
const RECORD_NOTE_START_LATE_SNAP_GRID_FRACTION = 0.6;

export const getRecordNoteStartLateSnapGraceBeats = (tempoBpm: number, gridBeats: number): number => {
  const graceBeats = (RECORD_NOTE_START_LATE_SNAP_GRACE_MS / 1000) * (tempoBpm / 60);
  return Math.min(graceBeats, gridBeats * RECORD_NOTE_START_LATE_SNAP_GRID_FRACTION);
};

// Live recording feels better when a note played just after a grid line is
// treated as an intended hit on that line, especially against percussion.
// After this small late-hit grace window, fall back to normal nearest-grid snap
// so genuinely early notes can still land on the upcoming grid line.
export const snapRecordedNoteStartBeat = (beat: number, gridBeats: number, tempoBpm: number): number => {
  const clampedBeat = Math.max(0, beat);
  const previousGridBeat = snapDownToGrid(clampedBeat, gridBeats);
  if (clampedBeat - previousGridBeat <= getRecordNoteStartLateSnapGraceBeats(tempoBpm, gridBeats)) {
    return previousGridBeat;
  }
  return snapToGrid(clampedBeat, gridBeats);
};
