import { clipNotesToBeatRange } from "@/lib/noteEditing";
import {
  BeatRange,
  getSelectedAutomationIdsByTrackId,
  getSelectedNoteIdsByTrackId,
  getSelectionBeatRange
} from "@/lib/noteClipboardSelection";
import { clipAutomationLaneToBeatRange, ClipboardAutomationKeyframeData, ClipboardAutomationLaneData } from "@/lib/automationTimelineEditing";
import { Project, Track } from "@/types/music";

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
  sourcePatchId: string;
  notes: ClipboardNoteData[];
  automationLanes: ClipboardAutomationLaneData[];
}

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

const isClipboardAutomationKeyframeData = (value: unknown): value is ClipboardAutomationKeyframeData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ClipboardAutomationKeyframeData>;
  if (typeof candidate.beat !== "number" || !Number.isFinite(candidate.beat) || candidate.beat < 0) {
    return false;
  }

  if (candidate.type === "split") {
    return (
      typeof candidate.incomingValue === "number" &&
      Number.isFinite(candidate.incomingValue) &&
      typeof candidate.outgoingValue === "number" &&
      Number.isFinite(candidate.outgoingValue)
    );
  }

  if (candidate.type === "whole") {
    return typeof candidate.value === "number" && Number.isFinite(candidate.value);
  }

  return false;
};

const isClipboardAutomationLaneData = (value: unknown): value is ClipboardAutomationLaneData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ClipboardAutomationLaneData>;
  return (
    typeof candidate.macroId === "string" &&
    candidate.macroId.length > 0 &&
    typeof candidate.startValue === "number" &&
    Number.isFinite(candidate.startValue) &&
    typeof candidate.endValue === "number" &&
    Number.isFinite(candidate.endValue) &&
    Array.isArray(candidate.keyframes) &&
    candidate.keyframes.every(isClipboardAutomationKeyframeData)
  );
};

const isClipboardTrackData = (value: unknown): value is ClipboardTrackData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ClipboardTrackData>;
  return (
    typeof candidate.sourcePatchId === "string" &&
    candidate.sourcePatchId.length > 0 &&
    Array.isArray(candidate.notes) &&
    candidate.notes.every(isClipboardNoteData) &&
    Array.isArray(candidate.automationLanes) &&
    candidate.automationLanes.every(isClipboardAutomationLaneData)
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
    candidate.beatSpan >= 0 &&
    Array.isArray(candidate.tracks) &&
    candidate.tracks.every(isClipboardTrackData)
  );
};

const getProjectTimelineEndBeat = (project: Project, fallbackEndBeat = 0) =>
  Math.max(
    project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0),
    fallbackEndBeat
  );

const buildClipboardAutomationLanes = (
  track: Track,
  range: BeatRange,
  timelineEndBeat: number,
  macroIds?: Set<string>
) =>
  Object.values(track.macroAutomations)
    .filter((lane) => !macroIds || macroIds.has(lane.macroId))
    .map((lane) => clipAutomationLaneToBeatRange(lane, range.startBeat, range.endBeat, timelineEndBeat))
    .filter((lane): lane is ClipboardAutomationLaneData => Boolean(lane));

export function buildNoteClipboardPayload(
  project: Project,
  noteSelectionKeys: Iterable<string>,
  automationSelectionKeys: Iterable<string> = []
): NoteClipboardPayload | null {
  const noteIdsByTrackId = getSelectedNoteIdsByTrackId(noteSelectionKeys);
  const automationIdsByTrackId = getSelectedAutomationIdsByTrackId(automationSelectionKeys);
  if (noteIdsByTrackId.size === 0 && automationIdsByTrackId.size === 0) {
    return null;
  }

  const range = getSelectionBeatRange(project, noteSelectionKeys, automationSelectionKeys);
  if (!range) {
    return null;
  }

  const timelineEndBeat = getProjectTimelineEndBeat(project, range.endBeat);
  const selectedTracks = project.tracks
    .map((track, index) => {
      const noteIds = noteIdsByTrackId.get(track.id);
      const selectedMacroIds = automationIdsByTrackId.get(track.id);
      const notes = track.notes.filter((note) => noteIds?.has(note.id));
      const automationLanes = buildClipboardAutomationLanes(
        track,
        range,
        timelineEndBeat,
        noteIds ? undefined : new Set(selectedMacroIds?.keys() ?? [])
      );
      return {
        index,
        track,
        notes,
        automationLanes,
        include: notes.length > 0 || automationLanes.length > 0
      };
    })
    .filter((entry) => entry.include);

  if (selectedTracks.length === 0) {
    return null;
  }

  return {
    type: NOTE_CLIPBOARD_TYPE,
    version: NOTE_CLIPBOARD_VERSION,
    beatSpan: range.beatSpan,
    tracks: selectedTracks.map((entry) => ({
      sourceTrackIndex: entry.index,
      sourcePatchId: entry.track.instrumentPatchId,
      notes: entry.notes
        .slice()
        .sort((a, b) => a.startBeat - b.startBeat)
        .map((note) => ({
          pitchStr: note.pitchStr,
          startBeat: note.startBeat - range.startBeat,
          durationBeats: note.durationBeats,
          velocity: note.velocity
        })),
      automationLanes: entry.automationLanes
    }))
  };
}

export function buildAllTracksClipboardPayload(project: Project, range: BeatRange): NoteClipboardPayload | null {
  if (range.beatSpan <= 0) {
    return null;
  }

  const timelineEndBeat = getProjectTimelineEndBeat(project, range.endBeat);
  return {
    type: NOTE_CLIPBOARD_TYPE,
    version: NOTE_CLIPBOARD_VERSION,
    beatSpan: range.beatSpan,
    tracks: project.tracks.map((track, index) => ({
      sourceTrackIndex: index,
      sourcePatchId: track.instrumentPatchId,
      notes: clipNotesToBeatRange(track.notes, range.startBeat, range.endBeat).map((note) => ({
        pitchStr: note.pitchStr,
        startBeat: note.startBeat - range.startBeat,
        durationBeats: note.durationBeats,
        velocity: note.velocity
      })),
      automationLanes: buildClipboardAutomationLanes(track, range, timelineEndBeat)
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
