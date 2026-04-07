import { createId } from "@/lib/ids";
import {
  getAutomationKeyframeIncomingValue,
  getAutomationKeyframeOutgoingValue,
  getTrackAutomationPoints,
  isSplitAutomationKeyframe
} from "@/lib/macroAutomation";
import { clipNotesToBeatRange, eraseNotesInBeatRange, insertBeatGap, removeBeatRangeAndCloseGap, sortNotes } from "@/lib/noteEditing";
import { sanitizeLoopSettings } from "@/lib/looping";
import { Note, Project, Track, TrackMacroAutomationKeyframe, TrackMacroAutomationLane } from "@/types/music";

const NOTE_CLIPBOARD_TYPE = "synth-playground/note-selection";
const NOTE_CLIPBOARD_VERSION = 1;
const EPSILON = 1e-9;

interface ClipboardNoteData {
  pitchStr: string;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

interface ClipboardAutomationKeyframeData {
  beat: number;
  type: "whole" | "split";
  value?: number;
  incomingValue?: number;
  outgoingValue?: number;
}

interface ClipboardAutomationLaneData {
  macroId: string;
  startValue: number;
  endValue: number;
  keyframes: ClipboardAutomationKeyframeData[];
}

interface ClipboardTrackData {
  sourceTrackIndex?: number;
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

export function getAutomationSelectionKey(trackId: string, macroId: string, keyframeId: string) {
  return `${trackId}:${macroId}:${keyframeId}`;
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

export const parseAutomationSelectionKey = (
  selectionKey: string
): { trackId: string; macroId: string; keyframeId: string } | null => {
  const firstSeparatorIndex = selectionKey.indexOf(":");
  const secondSeparatorIndex = selectionKey.indexOf(":", firstSeparatorIndex + 1);
  if (
    firstSeparatorIndex <= 0 ||
    secondSeparatorIndex <= firstSeparatorIndex + 1 ||
    secondSeparatorIndex >= selectionKey.length - 1
  ) {
    return null;
  }

  return {
    trackId: selectionKey.slice(0, firstSeparatorIndex),
    macroId: selectionKey.slice(firstSeparatorIndex + 1, secondSeparatorIndex),
    keyframeId: selectionKey.slice(secondSeparatorIndex + 1)
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

const sortAutomationKeyframes = (keyframes: TrackMacroAutomationKeyframe[]) =>
  keyframes.slice().sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));

const makeWholeAutomationKeyframe = (beat: number, value: number, id = createId("automation_keyframe")): TrackMacroAutomationKeyframe => ({
  id,
  beat,
  type: "whole",
  value
});

const makeSplitAutomationKeyframe = (
  beat: number,
  incomingValue: number,
  outgoingValue: number,
  id = createId("automation_keyframe")
): TrackMacroAutomationKeyframe => ({
  id,
  beat,
  type: "split",
  incomingValue,
  outgoingValue
});

const makeAutomationBoundaryKeyframe = (
  beat: number,
  incomingValue: number,
  outgoingValue: number,
  id = createId("automation_keyframe")
): TrackMacroAutomationKeyframe =>
  Math.abs(incomingValue - outgoingValue) <= EPSILON
    ? makeWholeAutomationKeyframe(beat, outgoingValue, id)
    : makeSplitAutomationKeyframe(beat, incomingValue, outgoingValue, id);

const makeClipboardAutomationKeyframe = (
  keyframe: TrackMacroAutomationKeyframe,
  startBeat: number
): ClipboardAutomationKeyframeData =>
  isSplitAutomationKeyframe(keyframe)
    ? {
        beat: keyframe.beat - startBeat,
        type: "split",
        incomingValue: getAutomationKeyframeIncomingValue(keyframe),
        outgoingValue: getAutomationKeyframeOutgoingValue(keyframe)
      }
    : {
        beat: keyframe.beat - startBeat,
        type: "whole",
        value: getAutomationKeyframeOutgoingValue(keyframe)
      };

const makeTrackAutomationKeyframeFromClipboard = (
  keyframe: ClipboardAutomationKeyframeData,
  beat: number
): TrackMacroAutomationKeyframe =>
  keyframe.type === "split"
    ? makeSplitAutomationKeyframe(beat, keyframe.incomingValue ?? 0, keyframe.outgoingValue ?? 0)
    : makeWholeAutomationKeyframe(beat, keyframe.value ?? keyframe.outgoingValue ?? 0);

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
    candidate.tracks.every(
      (track) =>
        Boolean(track) &&
        typeof track === "object" &&
        Array.isArray((track as Partial<ClipboardTrackData>).notes) &&
        Array.isArray((track as Partial<ClipboardTrackData>).automationLanes) &&
        (track as Partial<ClipboardTrackData>).notes?.every(isClipboardNoteData) &&
        (track as Partial<ClipboardTrackData>).automationLanes?.every(isClipboardAutomationLaneData)
    )
  );
};

const getAutomationLaneValueAtBeat = (
  lane: TrackMacroAutomationLane,
  beat: number,
  timelineEndBeat: number,
  side: "incoming" | "outgoing"
): number => {
  const points = getTrackAutomationPoints(lane, timelineEndBeat);
  const exact = points.find((point) => Math.abs(point.beat - beat) <= EPSILON);
  if (exact) {
    return side === "incoming" ? exact.leftValue : exact.rightValue;
  }

  let previous = points[0];
  for (const point of points) {
    if (point.beat < beat - EPSILON) {
      previous = point;
      continue;
    }
    const span = Math.max(point.beat - previous.beat, EPSILON);
    const t = Math.max(0, Math.min(1, (beat - previous.beat) / span));
    return previous.rightValue + (point.leftValue - previous.rightValue) * t;
  }

  return points[points.length - 1]?.rightValue ?? lane.endValue;
};

const clipAutomationLaneToBeatRange = (
  lane: TrackMacroAutomationLane,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
): ClipboardAutomationLaneData | null => {
  const keyframes = sortAutomationKeyframes(lane.keyframes.filter((keyframe) => keyframe.beat >= startBeat - EPSILON && keyframe.beat < endBeat - EPSILON));
  const startValue = getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "outgoing");
  const endValue = getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "incoming");
  if (keyframes.length === 0 && Math.abs(startValue - endValue) <= EPSILON) {
    return null;
  }

  return {
    macroId: lane.macroId,
    startValue,
    endValue,
    keyframes: keyframes.map((keyframe) => makeClipboardAutomationKeyframe(keyframe, startBeat))
  };
};

const replaceAutomationLaneBeatRange = (
  lane: TrackMacroAutomationLane,
  segment: ClipboardAutomationLaneData,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
): TrackMacroAutomationLane => {
  const incomingAtStart = getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "incoming");
  const outgoingAtEnd = getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "outgoing");
  const nextKeyframes = lane.keyframes
    .filter((keyframe) => keyframe.beat < startBeat - EPSILON || keyframe.beat > endBeat + EPSILON)
    .concat(segment.keyframes.map((keyframe) => makeTrackAutomationKeyframeFromClipboard(keyframe, startBeat + keyframe.beat)));

  if (startBeat > EPSILON) {
    nextKeyframes.push(makeAutomationBoundaryKeyframe(startBeat, incomingAtStart, segment.startValue));
  }

  if (endBeat < timelineEndBeat - EPSILON) {
    nextKeyframes.push(makeAutomationBoundaryKeyframe(endBeat, segment.endValue, outgoingAtEnd));
  }

  return {
    ...lane,
    startValue: startBeat <= EPSILON ? segment.startValue : lane.startValue,
    endValue: endBeat >= timelineEndBeat - EPSILON ? segment.endValue : lane.endValue,
    keyframes: sortAutomationKeyframes(nextKeyframes)
  };
};

const eraseAutomationLaneBeatRange = (
  lane: TrackMacroAutomationLane,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
) =>
  replaceAutomationLaneBeatRange(
    lane,
    {
      macroId: lane.macroId,
      startValue: getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "incoming"),
      endValue: getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "outgoing"),
      keyframes: []
    },
    startBeat,
    endBeat,
    timelineEndBeat
  );

const insertAutomationLaneGap = (
  lane: TrackMacroAutomationLane,
  atBeat: number,
  gapBeats: number,
  timelineEndBeat: number
): TrackMacroAutomationLane => {
  if (gapBeats <= 0) {
    return lane;
  }

  const shiftedLane: TrackMacroAutomationLane = {
    ...lane,
    keyframes: sortAutomationKeyframes(
      lane.keyframes.map((keyframe) =>
        keyframe.beat >= atBeat - EPSILON ? { ...keyframe, beat: keyframe.beat + gapBeats } : keyframe
      )
    )
  };

  return replaceAutomationLaneBeatRange(
    shiftedLane,
    {
      macroId: lane.macroId,
      startValue: getAutomationLaneValueAtBeat(lane, atBeat, timelineEndBeat, "incoming"),
      endValue: getAutomationLaneValueAtBeat(lane, atBeat, timelineEndBeat, "incoming"),
      keyframes: []
    },
    atBeat,
    atBeat + gapBeats,
    timelineEndBeat + gapBeats
  );
};

const removeAutomationLaneBeatRangeAndCloseGap = (
  lane: TrackMacroAutomationLane,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
): TrackMacroAutomationLane => {
  if (endBeat <= startBeat) {
    return lane;
  }

  const gap = endBeat - startBeat;
  const incomingAtStart = getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "incoming");
  const outgoingAtEnd = getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "outgoing");
  const nextKeyframes = lane.keyframes
    .flatMap((keyframe) => {
      if (keyframe.beat < startBeat - EPSILON) {
        return [keyframe];
      }
      if (keyframe.beat > endBeat + EPSILON) {
        return [{ ...keyframe, beat: keyframe.beat - gap }];
      }
      return [];
    });

  if (startBeat > EPSILON) {
    nextKeyframes.push(makeAutomationBoundaryKeyframe(startBeat, incomingAtStart, outgoingAtEnd));
  }

  return {
    ...lane,
    startValue: startBeat <= EPSILON ? outgoingAtEnd : lane.startValue,
    endValue: lane.endValue,
    keyframes: sortAutomationKeyframes(nextKeyframes)
  };
};

const getSelectedNoteIdsByTrackId = (selectionKeys: Iterable<string>) => {
  const noteIdsByTrackId = new Map<string, Set<string>>();
  for (const selectionKey of selectionKeys) {
    const parsed = parseNoteSelectionKey(selectionKey);
    if (!parsed) {
      continue;
    }
    const noteIds = noteIdsByTrackId.get(parsed.trackId) ?? new Set<string>();
    noteIds.add(parsed.noteId);
    noteIdsByTrackId.set(parsed.trackId, noteIds);
  }
  return noteIdsByTrackId;
};

const getSelectedAutomationIdsByTrackId = (selectionKeys: Iterable<string>) => {
  const automationIdsByTrackId = new Map<string, Map<string, Set<string>>>();
  for (const selectionKey of selectionKeys) {
    const parsed = parseAutomationSelectionKey(selectionKey);
    if (!parsed) {
      continue;
    }
    const laneSelection = automationIdsByTrackId.get(parsed.trackId) ?? new Map<string, Set<string>>();
    const keyframeIds = laneSelection.get(parsed.macroId) ?? new Set<string>();
    keyframeIds.add(parsed.keyframeId);
    laneSelection.set(parsed.macroId, keyframeIds);
    automationIdsByTrackId.set(parsed.trackId, laneSelection);
  }
  return automationIdsByTrackId;
};

export function getSelectionBeatRange(
  project: Project,
  noteSelectionKeys: Iterable<string>,
  automationSelectionKeys: Iterable<string> = []
): BeatRange | null {
  const noteIdsByTrackId = getSelectedNoteIdsByTrackId(noteSelectionKeys);
  const automationIdsByTrackId = getSelectedAutomationIdsByTrackId(automationSelectionKeys);
  const starts: number[] = [];
  const ends: number[] = [];

  for (const track of project.tracks) {
    const noteIds = noteIdsByTrackId.get(track.id);
    if (noteIds) {
      for (const note of track.notes) {
        if (!noteIds.has(note.id)) {
          continue;
        }
        starts.push(note.startBeat);
        ends.push(note.startBeat + note.durationBeats);
      }
    }

    const automationIds = automationIdsByTrackId.get(track.id);
    if (!automationIds) {
      continue;
    }

    for (const [macroId, keyframeIds] of automationIds) {
      const lane = track.macroAutomations[macroId];
      if (!lane) {
        continue;
      }
      for (const keyframe of lane.keyframes) {
        if (!keyframeIds.has(keyframe.id)) {
          continue;
        }
        starts.push(keyframe.beat);
        ends.push(keyframe.beat);
      }
    }
  }

  if (starts.length === 0 || ends.length === 0) {
    return null;
  }

  const startBeat = Math.min(...starts);
  const endBeat = Math.max(...ends);
  return {
    startBeat,
    endBeat,
    beatSpan: Math.max(0, endBeat - startBeat)
  };
}

export function getSelectionSourceTrackId(
  project: Project,
  noteSelectionKeys: Iterable<string>,
  automationSelectionKeys: Iterable<string> = []
): string | null {
  const selectedTrackIds = new Set<string>();
  for (const selectionKey of noteSelectionKeys) {
    const parsed = parseNoteSelectionKey(selectionKey);
    if (parsed) {
      selectedTrackIds.add(parsed.trackId);
    }
  }
  for (const selectionKey of automationSelectionKeys) {
    const parsed = parseAutomationSelectionKey(selectionKey);
    if (parsed) {
      selectedTrackIds.add(parsed.trackId);
    }
  }

  const sourceTrack = project.tracks.find((track) => selectedTrackIds.has(track.id));
  return sourceTrack?.id ?? null;
}

const buildClipboardAutomationLanes = (
  track: Track,
  range: BeatRange,
  timelineEndBeat: number,
  macroIds?: Set<string>
) => Object.values(track.macroAutomations)
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

  const timelineEndBeat = Math.max(project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0), range.endBeat);
  const selectedTracks = project.tracks
    .map((track, index) => {
      const noteIds = noteIdsByTrackId.get(track.id);
      const selectedMacroIds = automationIdsByTrackId.get(track.id);
      const notes = track.notes.filter((note) => noteIds?.has(note.id));
      const automationLanes = buildClipboardAutomationLanes(track, range, timelineEndBeat, noteIds ? undefined : new Set(selectedMacroIds?.keys() ?? []));
      return {
        index,
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

  const timelineEndBeat = Math.max(project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0), range.endBeat);
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

const getCompatibleMacroIds = (project: Project, track: Track) => {
  const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
  return new Set(patch?.ui.macros.map((macro) => macro.id) ?? Object.keys(track.macroAutomations));
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
  const pastedTrackDataByTrackId = new Map(destinationTracks.map((track, index) => [track.id, payload.tracks[index]] as const));
  const pasteEndBeat = playheadBeat + payload.beatSpan;
  const selectionKeys: string[] = [];
  const timelineEndBeat = Math.max(
    project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0),
    pasteEndBeat
  );

  const tracks = project.tracks.map((track) => {
    const inserted = insertedByTrackId.get(track.id);
    const copiedTrack = pastedTrackDataByTrackId.get(track.id);
    if (!inserted || !copiedTrack) {
      return track;
    }

    const cleared = eraseNotesInBeatRange(track.notes, playheadBeat, pasteEndBeat);
    for (const note of inserted.notes) {
      selectionKeys.push(getNoteSelectionKey(track.id, note.id));
    }

    let nextTrack: Track = {
      ...track,
      notes: sortNotes([...cleared, ...inserted.notes])
    };

    if (copiedTrack.automationLanes.length > 0) {
      const compatibleMacroIds = getCompatibleMacroIds(project, track);
      const nextMacroAutomations = { ...nextTrack.macroAutomations };
      const nextMacroValues = { ...nextTrack.macroValues };
      for (const laneSegment of copiedTrack.automationLanes) {
        if (!compatibleMacroIds.has(laneSegment.macroId)) {
          continue;
        }
        const baseLane = nextMacroAutomations[laneSegment.macroId] ?? {
          macroId: laneSegment.macroId,
          expanded: true,
          startValue: nextMacroValues[laneSegment.macroId] ?? laneSegment.startValue,
          endValue: nextMacroValues[laneSegment.macroId] ?? laneSegment.endValue,
          keyframes: []
        };
        nextMacroAutomations[laneSegment.macroId] = replaceAutomationLaneBeatRange(
          baseLane,
          laneSegment,
          playheadBeat,
          pasteEndBeat,
          timelineEndBeat
        );
        nextMacroValues[laneSegment.macroId] = nextMacroAutomations[laneSegment.macroId].startValue;
      }
      nextTrack = {
        ...nextTrack,
        macroAutomations: nextMacroAutomations,
        macroValues: nextMacroValues
      };
    }

    return nextTrack;
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
  const timelineEndBeat = project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
  const shiftedProject = shiftBeatBoundSongStructureForInsertedGap({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: insertBeatGap(track.notes, playheadBeat, payload.beatSpan),
      macroAutomations: Object.fromEntries(
        Object.entries(track.macroAutomations).map(([macroId, lane]) => [
          macroId,
          insertAutomationLaneGap(lane, playheadBeat, payload.beatSpan, timelineEndBeat)
        ])
      )
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
  const timelineEndBeat = project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
  const shiftedProject = shiftBeatBoundSongStructureForInsertedGap({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: insertBeatGap(track.notes, playheadBeat, payload.beatSpan),
      macroAutomations: Object.fromEntries(
        Object.entries(track.macroAutomations).map(([macroId, lane]) => [
          macroId,
          insertAutomationLaneGap(lane, playheadBeat, payload.beatSpan, timelineEndBeat)
        ])
      )
    }))
  }, playheadBeat, payload.beatSpan);
  return applyNoteClipboardPaste(shiftedProject, payload, firstTrackId, playheadBeat);
}

export function cutBeatRangeAcrossAllTracks(project: Project, range: BeatRange): Project {
  const timelineEndBeat = Math.max(
    project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0),
    range.endBeat
  );
  return shiftBeatBoundSongStructureForRemovedRange({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: removeBeatRangeAndCloseGap(track.notes, range.startBeat, range.endBeat),
      macroAutomations: Object.fromEntries(
        Object.entries(track.macroAutomations).map(([macroId, lane]) => [
          macroId,
          removeAutomationLaneBeatRangeAndCloseGap(lane, range.startBeat, range.endBeat, timelineEndBeat)
        ])
      )
    }))
  }, range.startBeat, range.endBeat);
}

export function eraseAutomationInRangeForTracks(
  project: Project,
  range: BeatRange,
  trackIds: Iterable<string>
): Project {
  const selectedTrackIds = new Set(trackIds);
  const timelineEndBeat = Math.max(
    project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0),
    range.endBeat
  );
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (!selectedTrackIds.has(track.id)) {
        return track;
      }
      return {
        ...track,
        macroAutomations: Object.fromEntries(
          Object.entries(track.macroAutomations).map(([macroId, lane]) => [
            macroId,
            eraseAutomationLaneBeatRange(lane, range.startBeat, range.endBeat, timelineEndBeat)
          ])
        )
      };
    })
  };
}

export function deleteSelectedAutomationKeyframes(project: Project, selectionKeys: Iterable<string>): Project {
  const automationIdsByTrackId = getSelectedAutomationIdsByTrackId(selectionKeys);
  if (automationIdsByTrackId.size === 0) {
    return project;
  }

  return {
    ...project,
    tracks: project.tracks.map((track) => {
      const laneSelections = automationIdsByTrackId.get(track.id);
      if (!laneSelections) {
        return track;
      }
      return {
        ...track,
        macroAutomations: Object.fromEntries(
          Object.entries(track.macroAutomations).map(([macroId, lane]) => {
            const keyframeIds = laneSelections.get(macroId);
            if (!keyframeIds) {
              return [macroId, lane] as const;
            }
            return [
              macroId,
              {
                ...lane,
                keyframes: lane.keyframes.filter((keyframe) => !keyframeIds.has(keyframe.id))
              }
            ] as const;
          })
        )
      };
    })
  };
}
