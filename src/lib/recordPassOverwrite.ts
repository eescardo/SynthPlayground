import { snapDownToGrid } from "@/lib/musicTiming";

export interface RecordPassOverwrite {
  trackId: string;
  lastErasedBeat: number;
  erasedBeatKeys: Set<string>;
  createdNoteIds: Set<string>;
}

export interface EraseBeatRange {
  fromBeat: number;
  toBeat: number;
}

export const createRecordPassOverwrite = (trackId: string, cueBeat: number): RecordPassOverwrite => ({
  trackId,
  lastErasedBeat: cueBeat,
  erasedBeatKeys: new Set(),
  createdNoteIds: new Set()
});

export const getRecordPassProtectedNoteIds = (
  recordPass: RecordPassOverwrite | null,
  trackId: string,
  activeNoteIds: Iterable<string>
): Set<string> =>
  new Set([
    ...Array.from(activeNoteIds),
    ...(recordPass?.trackId === trackId ? Array.from(recordPass.createdNoteIds) : [])
  ]);

export const registerRecordPassCreatedNote = (
  recordPass: RecordPassOverwrite | null,
  trackId: string,
  noteId: string
): void => {
  if (recordPass?.trackId === trackId) {
    recordPass.createdNoteIds.add(noteId);
  }
};

export const markRecordPassGridCellErased = (
  recordPass: RecordPassOverwrite | null,
  trackId: string,
  startBeat: number
): boolean => {
  if (recordPass?.trackId !== trackId) {
    return true;
  }

  const beatKey = startBeat.toFixed(6);
  if (recordPass.erasedBeatKeys.has(beatKey)) {
    return false;
  }
  recordPass.erasedBeatKeys.add(beatKey);
  return true;
};

export const advanceRecordPassEraseBeat = (
  recordPass: RecordPassOverwrite,
  playheadBeat: number,
  gridBeats: number
): EraseBeatRange | null => {
  const nextErasedBeat = snapDownToGrid(playheadBeat, gridBeats);
  if (nextErasedBeat <= recordPass.lastErasedBeat) {
    return null;
  }

  const eraseRange = {
    fromBeat: recordPass.lastErasedBeat,
    toBeat: nextErasedBeat
  };
  recordPass.lastErasedBeat = nextErasedBeat;
  return eraseRange;
};
