import { createId } from "@/lib/ids";
import { clipNotesToBeatRange, eraseNotesInBeatRange, insertBeatGap, removeBeatRangeAndCloseGap, sortNotes } from "@/lib/noteEditing";
import { sanitizeLoopSettings } from "@/lib/looping";
import { Note, Project, Track } from "@/types/music";

const NOTE_CLIPBOARD_TYPE = "synth-playground/note-selection";
const NOTE_CLIPBOARD_VERSION = 1;

interface ClipboardNoteData {
  pitchStr: string;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

interface ClipboardTrackData {
  sourceTrackIndex?: number;
  notes: ClipboardNoteData[];
}

// Clipboard payloads always store notes grouped by track, normalized so each note start is
// relative to the copied beat window. A regular note selection includes only tracks that contain
// selected notes, while an "all tracks" selection includes every track, including empty ones.
export interface NoteClipboardPayload {
  type: typeof NOTE_CLIPBOARD_TYPE;
  version: typeof NOTE_CLIPBOARD_VERSION;
  beatSpan: number;
  tracks: ClipboardTrackData[];
}

export interface SerializedNoteClipboardPayload {
  plainText: string;
  html: string;
}

export interface AppliedNoteClipboardPaste {
  project: Project;
  selectionKeys: string[];
}

export interface BeatRange {
  startBeat: number;
  endBeat: number;
  beatSpan: number;
}

export function getNoteSelectionKey(trackId: string, noteId: string) {
  return `${trackId}:${noteId}`;
}

export const parseNoteSelectionKey = (selectionKey: string): { trackId: string; noteId: string } | null => {
  const separatorIndex = selectionKey.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= selectionKey.length - 1) {
    return null;
  }

  return {
    trackId: selectionKey.slice(0, separatorIndex),
    noteId: selectionKey.slice(separatorIndex + 1)
  };
};

const encodeBase64 = (value: string) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf-8").toString("base64");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf-8");
  }

  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const isClipboardNoteData = (value: unknown): value is ClipboardNoteData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ClipboardNoteData>;
  return (
    typeof candidate.pitchStr === "string" &&
    typeof candidate.startBeat === "number" &&
    Number.isFinite(candidate.startBeat) &&
    candidate.startBeat >= 0 &&
    typeof candidate.durationBeats === "number" &&
    Number.isFinite(candidate.durationBeats) &&
    candidate.durationBeats > 0 &&
    typeof candidate.velocity === "number" &&
    Number.isFinite(candidate.velocity)
  );
};

const isNoteClipboardPayload = (value: unknown): value is NoteClipboardPayload => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<NoteClipboardPayload>;
  return (
    candidate.type === NOTE_CLIPBOARD_TYPE &&
    candidate.version === NOTE_CLIPBOARD_VERSION &&
    typeof candidate.beatSpan === "number" &&
    Number.isFinite(candidate.beatSpan) &&
    candidate.beatSpan > 0 &&
    Array.isArray(candidate.tracks) &&
    candidate.tracks.every(
      (track) =>
        Boolean(track) &&
        typeof track === "object" &&
        Array.isArray((track as Partial<ClipboardTrackData>).notes) &&
        (track as Partial<ClipboardTrackData>).notes?.every(isClipboardNoteData)
    )
  );
};

export function getSelectionBeatRange(project: Project, selectionKeys: Iterable<string>): BeatRange | null {
  const noteIdsByTrackId = new Map<string, Set<string>>();
  for (const selectionKey of selectionKeys) {
    const parsed = parseNoteSelectionKey(selectionKey);
    if (!parsed) {
      continue;
    }
    const trackSelection = noteIdsByTrackId.get(parsed.trackId) ?? new Set<string>();
    trackSelection.add(parsed.noteId);
    noteIdsByTrackId.set(parsed.trackId, trackSelection);
  }

  if (noteIdsByTrackId.size === 0) {
    return null;
  }

  const selectedTracks = project.tracks
    .map((track) => ({
      track,
      notes: track.notes.filter((note) => noteIdsByTrackId.get(track.id)?.has(note.id))
    }))
    .filter((entry) => entry.notes.length > 0);

  if (selectedTracks.length === 0) {
    return null;
  }

  const startBeat = Math.min(...selectedTracks.flatMap((entry) => entry.notes.map((note) => note.startBeat)));
  const endBeat = Math.max(...selectedTracks.flatMap((entry) => entry.notes.map((note) => note.startBeat + note.durationBeats)));

  return {
    startBeat,
    endBeat,
    beatSpan: endBeat - startBeat
  };
}

export function getSelectionSourceTrackId(project: Project, selectionKeys: Iterable<string>): string | null {
  const selectedNoteKeySet = new Set(selectionKeys);
  if (selectedNoteKeySet.size === 0) {
    return null;
  }

  const sourceTrack = project.tracks.find((track) =>
    track.notes.some((note) => selectedNoteKeySet.has(getNoteSelectionKey(track.id, note.id)))
  );

  return sourceTrack?.id ?? null;
}

export function buildNoteClipboardPayload(project: Project, selectionKeys: Iterable<string>): NoteClipboardPayload | null {
  const noteIdsByTrackId = new Map<string, Set<string>>();
  for (const selectionKey of selectionKeys) {
    const parsed = parseNoteSelectionKey(selectionKey);
    if (!parsed) {
      continue;
    }
    const trackSelection = noteIdsByTrackId.get(parsed.trackId) ?? new Set<string>();
    trackSelection.add(parsed.noteId);
    noteIdsByTrackId.set(parsed.trackId, trackSelection);
  }

  if (noteIdsByTrackId.size === 0) {
    return null;
  }

  const selectedTracks = project.tracks
    .map((track, index) => ({
      index,
      track,
      notes: track.notes.filter((note) => noteIdsByTrackId.get(track.id)?.has(note.id))
    }))
    .filter((entry) => entry.notes.length > 0);

  const range = getSelectionBeatRange(project, selectionKeys);
  if (!range) {
    return null;
  }

  return {
    type: NOTE_CLIPBOARD_TYPE,
    version: NOTE_CLIPBOARD_VERSION,
    beatSpan: range.beatSpan,
    tracks: selectedTracks.map((entry) => ({
      sourceTrackIndex: entry.index,
      notes: entry.notes
        .slice()
        .sort((a, b) => a.startBeat - b.startBeat)
        .map((note) => ({
          pitchStr: note.pitchStr,
          startBeat: note.startBeat - range.startBeat,
          durationBeats: note.durationBeats,
          velocity: note.velocity
        }))
    }))
  };
}

export function buildAllTracksClipboardPayload(project: Project, range: BeatRange): NoteClipboardPayload | null {
  if (range.beatSpan <= 0) {
    return null;
  }

  return {
    type: NOTE_CLIPBOARD_TYPE,
    version: NOTE_CLIPBOARD_VERSION,
    beatSpan: range.beatSpan,
    tracks: project.tracks.map((track, index) => ({
      sourceTrackIndex: index,
      notes: clipNotesToBeatRange(track.notes, range.startBeat, range.endBeat).map((note) => ({
        pitchStr: note.pitchStr,
        startBeat: note.startBeat - range.startBeat,
        durationBeats: note.durationBeats,
        velocity: note.velocity
      }))
    }))
  };
}

export function serializeNoteClipboardPayload(payload: NoteClipboardPayload): SerializedNoteClipboardPayload {
  const encoded = encodeBase64(JSON.stringify(payload));
  return {
    plainText: encoded,
    html: `<meta charset='utf-8'><meta charset="utf-8"><span data-synth="${encoded}">${encoded}</span>`
  };
}

const extractEncodedPayload = (html: string | null | undefined, plainText: string | null | undefined) => {
  const fromHtml = html?.match(/data-synth=(?:"([^"]+)"|'([^']+)')/i);
  const htmlValue = fromHtml?.[1] ?? fromHtml?.[2];
  if (htmlValue) {
    return htmlValue.trim();
  }

  const trimmedText = plainText?.trim();
  return trimmedText ? trimmedText : null;
};

export function parseNoteClipboardPayload(html: string | null | undefined, plainText: string | null | undefined): NoteClipboardPayload | null {
  const encoded = extractEncodedPayload(html, plainText);
  if (!encoded) {
    return null;
  }

  try {
    const decoded = decodeBase64(encoded);
    const parsed = JSON.parse(decoded) as unknown;
    return isNoteClipboardPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const buildInsertedNotes = (track: Track, playheadBeat: number, copiedTrack: ClipboardTrackData) => {
  const insertedNotes: Note[] = copiedTrack.notes.map((note) => ({
    id: createId("note"),
    pitchStr: note.pitchStr,
    startBeat: playheadBeat + note.startBeat,
    durationBeats: note.durationBeats,
    velocity: note.velocity
  }));

  return {
    trackId: track.id,
    notes: insertedNotes
  };
};

const shiftBeatBoundSongStructureForInsertedGap = (project: Project, atBeat: number, gapBeats: number) => ({
  ...project,
  global: {
    ...project.global,
    loop: sanitizeLoopSettings(
      project.global.loop.map((marker) => ({
        ...marker,
        beat: marker.beat >= atBeat ? marker.beat + gapBeats : marker.beat
      }))
    )
  }
});

const shiftBeatBoundSongStructureForRemovedRange = (project: Project, startBeat: number, endBeat: number) => {
  const gap = endBeat - startBeat;
  return {
    ...project,
    global: {
      ...project.global,
      loop: sanitizeLoopSettings(
        project.global.loop.flatMap((marker) => {
          if (marker.beat < startBeat) {
            return [marker];
          }

          if (marker.beat >= endBeat) {
            return [{ ...marker, beat: marker.beat - gap }];
          }

          return [];
        })
      )
    }
  };
};

export function applyNoteClipboardPaste(
  project: Project,
  payload: NoteClipboardPayload,
  selectedTrackId: string,
  playheadBeat: number
): AppliedNoteClipboardPaste {
  const startTrackIndex = project.tracks.findIndex((track) => track.id === selectedTrackId);
  if (startTrackIndex < 0 || payload.tracks.length === 0) {
    return { project, selectionKeys: [] };
  }

  const destinationTracks = project.tracks.slice(startTrackIndex, startTrackIndex + payload.tracks.length);
  if (destinationTracks.length === 0) {
    return { project, selectionKeys: [] };
  }

  const insertedByTrackId = new Map(destinationTracks.map((track, index) => [track.id, buildInsertedNotes(track, playheadBeat, payload.tracks[index])] as const));
  const pasteEndBeat = playheadBeat + payload.beatSpan;
  const selectionKeys: string[] = [];

  const tracks = project.tracks.map((track) => {
    const inserted = insertedByTrackId.get(track.id);
    if (!inserted) {
      return track;
    }

    const cleared = eraseNotesInBeatRange(track.notes, playheadBeat, pasteEndBeat);
    for (const note of inserted.notes) {
      selectionKeys.push(getNoteSelectionKey(track.id, note.id));
    }

    return {
      ...track,
      notes: sortNotes([...cleared, ...inserted.notes])
    };
  });

  return {
    project: {
      ...project,
      tracks
    },
    selectionKeys
  };
}

export function applyNoteClipboardInsert(
  project: Project,
  payload: NoteClipboardPayload,
  selectedTrackId: string,
  playheadBeat: number
): AppliedNoteClipboardPaste {
  const shiftedProject = shiftBeatBoundSongStructureForInsertedGap({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: insertBeatGap(track.notes, playheadBeat, payload.beatSpan)
    }))
  }, playheadBeat, payload.beatSpan);
  return applyNoteClipboardPaste(shiftedProject, payload, selectedTrackId, playheadBeat);
}

export function applyNoteClipboardInsertAllTracks(
  project: Project,
  payload: NoteClipboardPayload,
  playheadBeat: number
): AppliedNoteClipboardPaste {
  const firstTrackId = project.tracks[0]?.id;
  if (!firstTrackId) {
    return { project, selectionKeys: [] };
  }
  const shiftedProject = shiftBeatBoundSongStructureForInsertedGap({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: insertBeatGap(track.notes, playheadBeat, payload.beatSpan)
    }))
  }, playheadBeat, payload.beatSpan);
  return applyNoteClipboardPaste(shiftedProject, payload, firstTrackId, playheadBeat);
}

export function cutBeatRangeAcrossAllTracks(project: Project, range: BeatRange): Project {
  return shiftBeatBoundSongStructureForRemovedRange({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: removeBeatRangeAndCloseGap(track.notes, range.startBeat, range.endBeat)
    }))
  }, range.startBeat, range.endBeat);
}
