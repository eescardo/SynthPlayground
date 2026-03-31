import { beatToSample, samplesPerBeat } from "@/lib/musicTiming";
import { createId } from "@/lib/ids";
import { Note, Project, ProjectGlobalSettings, Track } from "@/types/music";

export interface SanitizedLoopMarker {
  id: string;
  kind: "start" | "end";
  beat: number;
  repeatCount?: number;
}

export interface LoopBoundaryConflict {
  trackId: string;
  trackName: string;
  noteId: string;
  pitchStr: string;
  startBeat: number;
  endBeat: number;
  boundaryBeat: number;
  boundary: "start" | "end";
  loopId: string;
}

export interface LoopMarkerState {
  markerId: string;
  kind: "start" | "end";
  beat: number;
  repeatCount?: number;
  matched: boolean;
  loopId?: string;
}

interface LoopPair {
  id: string;
  startMarkerId: string;
  endMarkerId: string;
  startBeat: number;
  endBeat: number;
  repeatCount: number;
  children: LoopPair[];
}

const EPSILON = 1e-9;
export const DEFAULT_LOOP_REPEAT_COUNT = 1;

type LoopMarkerInput = ProjectGlobalSettings["loop"][number];

const clampRepeatCount = (repeatCount: unknown): number =>
  typeof repeatCount === "number" && Number.isFinite(repeatCount)
    ? Math.max(1, Math.min(16, Math.round(repeatCount)))
    : DEFAULT_LOOP_REPEAT_COUNT;

const sortMarkers = (markers: SanitizedLoopMarker[]): SanitizedLoopMarker[] =>
  [...markers].sort((left, right) => {
    if (left.beat !== right.beat) {
      return left.beat - right.beat;
    }
    if (left.kind === right.kind) {
      return left.id.localeCompare(right.id);
    }
    return left.kind === "start" ? -1 : 1;
  });

const sanitizeMarker = (marker: LoopMarkerInput, index: number): SanitizedLoopMarker | null => {
  const beatValue = marker.beat;
  const beat = typeof beatValue === "number" && Number.isFinite(beatValue) ? Math.max(0, beatValue) : undefined;
  if (beat === undefined) {
    return null;
  }

  const kind = marker.kind === "end" ? "end" : marker.kind === "start" ? "start" : null;
  if (!kind) {
    return null;
  }

  return {
    id: marker.id || `loop_marker_${index}`,
    kind,
    beat,
    repeatCount: kind === "end" ? clampRepeatCount(marker.repeatCount) : undefined
  };
};

export const sanitizeLoopSettings = (
  loop: ProjectGlobalSettings["loop"]
): ProjectGlobalSettings["loop"] => {
  const markers = sortMarkers(
    loop
      .map((marker, index) => sanitizeMarker(marker, index))
      .filter((marker): marker is SanitizedLoopMarker => Boolean(marker))
  );

  return markers.map((marker) => ({
    id: marker.id,
    kind: marker.kind,
    beat: marker.beat,
    repeatCount: marker.repeatCount
  }));
};

export const getSanitizedLoopMarkers = (
  loop: ProjectGlobalSettings["loop"]
): SanitizedLoopMarker[] => sanitizeLoopSettings(loop);

const buildLoopPairs = (loop: ProjectGlobalSettings["loop"]) => {
  const markers = getSanitizedLoopMarkers(loop);
  const states: LoopMarkerState[] = markers.map((marker) => ({
    markerId: marker.id,
    kind: marker.kind,
    beat: marker.beat,
    repeatCount: marker.repeatCount,
    matched: false
  }));

  const stateById = new Map(states.map((state) => [state.markerId, state] as const));
  const stack: Array<{ marker: SanitizedLoopMarker; children: LoopPair[] }> = [];
  const pairs: LoopPair[] = [];

  for (const marker of markers) {
    if (marker.kind === "start") {
      stack.push({ marker, children: [] });
      continue;
    }

    const open = stack.pop();
    if (!open || marker.beat <= open.marker.beat + EPSILON) {
      continue;
    }

    const pair: LoopPair = {
      id: `loop_pair:${open.marker.id}:${marker.id}`,
      startMarkerId: open.marker.id,
      endMarkerId: marker.id,
      startBeat: open.marker.beat,
      endBeat: marker.beat,
      repeatCount: marker.repeatCount ?? DEFAULT_LOOP_REPEAT_COUNT,
      children: open.children
    };

    stateById.get(open.marker.id)!.matched = true;
    stateById.get(open.marker.id)!.loopId = pair.id;
    stateById.get(marker.id)!.matched = true;
    stateById.get(marker.id)!.loopId = pair.id;

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(pair);
    } else {
      pairs.push(pair);
    }
  }

  return {
    markers,
    markerStates: states,
    pairs: pairs.sort((left, right) => left.startBeat - right.startBeat)
  };
};

export const getLoopMarkerStates = (
  loop: ProjectGlobalSettings["loop"]
): LoopMarkerState[] => buildLoopPairs(loop).markerStates;

export const findMatchingLoopStart = (
  loop: ProjectGlobalSettings["loop"],
  beat: number
): SanitizedLoopMarker | null => {
  const markers = getSanitizedLoopMarkers(loop);
  const stack: SanitizedLoopMarker[] = [];
  for (const marker of markers) {
    if (marker.beat >= beat - EPSILON) {
      break;
    }
    if (marker.kind === "start") {
      stack.push(marker);
    } else if (stack.length > 0) {
      stack.pop();
    }
  }
  return stack[stack.length - 1] ?? null;
};

const getSequencePlaybackLength = (startBeat: number, endBeat: number, children: LoopPair[]): number => {
  let total = 0;
  let cursor = startBeat;

  for (const child of children) {
    if (child.startBeat > cursor + EPSILON) {
      total += child.startBeat - cursor;
    }
    const childBodyLength = getSequencePlaybackLength(child.startBeat, child.endBeat, child.children);
    total += childBodyLength * (child.repeatCount + 1);
    cursor = child.endBeat;
  }

  if (endBeat > cursor + EPSILON) {
    total += endBeat - cursor;
  }
  return total;
};

const collectPlaybackBeatsInSequence = (
  songBeat: number,
  startBeat: number,
  endBeat: number,
  children: LoopPair[],
  playbackStart: number,
  results: number[]
): void => {
  let cursorSong = startBeat;
  let cursorPlayback = playbackStart;

  for (const child of children) {
    if (songBeat < child.startBeat - EPSILON) {
      if (songBeat >= cursorSong - EPSILON && songBeat < child.startBeat - EPSILON) {
        results.push(cursorPlayback + (songBeat - cursorSong));
      }
      return;
    }

    if (child.startBeat > cursorSong + EPSILON) {
      cursorPlayback += child.startBeat - cursorSong;
      cursorSong = child.startBeat;
    }

    if (songBeat < child.endBeat - EPSILON) {
      const bodyLength = getSequencePlaybackLength(child.startBeat, child.endBeat, child.children);
      const bodyOffsets: number[] = [];
      collectPlaybackBeatsInSequence(songBeat, child.startBeat, child.endBeat, child.children, 0, bodyOffsets);
      for (let passIndex = 0; passIndex <= child.repeatCount; passIndex += 1) {
        const passPlaybackStart = cursorPlayback + passIndex * bodyLength;
        for (const bodyOffset of bodyOffsets) {
          results.push(passPlaybackStart + bodyOffset);
        }
      }
      return;
    }

    cursorPlayback += getSequencePlaybackLength(child.startBeat, child.endBeat, child.children) * (child.repeatCount + 1);
    cursorSong = child.endBeat;
  }

  if (songBeat >= cursorSong - EPSILON && songBeat <= endBeat + EPSILON) {
    results.push(cursorPlayback + (songBeat - cursorSong));
  }
};

export const getLoopedPlaybackBeatsForSongBeat = (
  songBeat: number,
  cueBeat: number,
  loop: ProjectGlobalSettings["loop"]
): number[] => {
  if (songBeat < cueBeat - EPSILON) {
    return [];
  }
  const { pairs } = buildLoopPairs(loop);
  const results: number[] = [];
  collectPlaybackBeatsInSequence(songBeat, cueBeat, Number.POSITIVE_INFINITY, pairs, 0, results);
  return results.sort((left, right) => left - right);
};

export const getPlaybackBeatForSongBeat = (
  songBeat: number,
  cueBeat: number,
  loop: ProjectGlobalSettings["loop"]
): number => getLoopedPlaybackBeatsForSongBeat(songBeat, cueBeat, loop)[0] ?? Math.max(0, songBeat - cueBeat);

const mapPlaybackBeatInSequence = (
  playbackBeat: number,
  startBeat: number,
  endBeat: number,
  children: LoopPair[]
): number => {
  let remaining = Math.max(0, playbackBeat);
  let cursorSong = startBeat;

  for (const child of children) {
    const gap = Math.max(0, child.startBeat - cursorSong);
    if (remaining < gap - EPSILON) {
      return cursorSong + remaining;
    }
    remaining -= gap;
    cursorSong = child.startBeat;

    const bodyLength = getSequencePlaybackLength(child.startBeat, child.endBeat, child.children);
    const totalLength = bodyLength * (child.repeatCount + 1);
    if (remaining < totalLength - EPSILON || Math.abs(remaining - totalLength) <= EPSILON) {
      const passOffset = bodyLength <= EPSILON ? 0 : remaining % bodyLength;
      return mapPlaybackBeatInSequence(passOffset, child.startBeat, child.endBeat, child.children);
    }

    remaining -= totalLength;
    cursorSong = child.endBeat;
  }

  return Math.min(endBeat, cursorSong + remaining);
};

export const getSongBeatForPlaybackBeat = (
  playbackBeat: number,
  cueBeat: number,
  loop: ProjectGlobalSettings["loop"]
): number => {
  const { pairs } = buildLoopPairs(loop);
  return mapPlaybackBeatInSequence(playbackBeat, cueBeat, Number.POSITIVE_INFINITY, pairs);
};

export const getLoopPlaybackEndBeat = (project: Project, cueBeat: number, fallbackEndBeat: number): number => {
  const { pairs } = buildLoopPairs(project.global.loop);
  return cueBeat + getSequencePlaybackLength(cueBeat, fallbackEndBeat, pairs.filter((pair) => pair.startBeat < fallbackEndBeat - EPSILON));
};

const noteCrossesBoundary = (note: Note, boundaryBeat: number): boolean => {
  const endBeat = note.startBeat + note.durationBeats;
  return note.startBeat < boundaryBeat - EPSILON && endBeat > boundaryBeat + EPSILON;
};

export const findLoopBoundaryConflicts = (
  project: Project,
  loop: ProjectGlobalSettings["loop"]
): LoopBoundaryConflict[] => {
  const markers = getSanitizedLoopMarkers(loop);
  if (markers.length === 0) {
    return [];
  }

  const conflicts: LoopBoundaryConflict[] = [];
  for (const track of project.tracks) {
    for (const note of track.notes) {
      const endBeat = note.startBeat + note.durationBeats;
      for (const marker of markers) {
        if (!noteCrossesBoundary(note, marker.beat)) {
          continue;
        }
        conflicts.push({
          trackId: track.id,
          trackName: track.name,
          noteId: note.id,
          pitchStr: note.pitchStr,
          startBeat: note.startBeat,
          endBeat,
          boundaryBeat: marker.beat,
          boundary: marker.kind,
          loopId: marker.id
        });
      }
    }
  }
  return conflicts;
};

const splitNoteAtBeat = (note: Note, beat: number): Note[] => {
  if (!noteCrossesBoundary(note, beat)) {
    return [note];
  }

  return [
    {
      ...note,
      durationBeats: beat - note.startBeat
    },
    {
      ...note,
      id: createId("note"),
      startBeat: beat,
      durationBeats: note.startBeat + note.durationBeats - beat
    }
  ];
};

const splitTrackNotesAtBoundary = (track: Track, boundaryBeat: number): Track => ({
  ...track,
  notes: track.notes.flatMap((note) => splitNoteAtBeat(note, boundaryBeat)).sort((a, b) => a.startBeat - b.startBeat)
});

export const splitProjectNotesAtLoopBoundaries = (
  project: Project,
  loop: ProjectGlobalSettings["loop"]
): Project => {
  const boundaryBeats = getSanitizedLoopMarkers(loop)
    .map((marker) => marker.beat)
    .sort((a, b) => a - b);

  let nextProject = project;
  for (const boundaryBeat of boundaryBeats) {
    nextProject = {
      ...nextProject,
      tracks: nextProject.tracks.map((track) => splitTrackNotesAtBoundary(track, boundaryBeat))
    };
  }
  return nextProject;
};

export interface PlaybackLoopWindow {
  startPlaybackSample: number;
  endPlaybackSample: number;
}

export const getExpandedPlaybackEndSample = (
  project: Project,
  cueBeat: number,
  fallbackEndBeat: number,
  sampleRate: number
): number => beatToSample(getLoopPlaybackEndBeat(project, cueBeat, fallbackEndBeat) - cueBeat, sampleRate, project.global.tempo);

export const getSongBeatFromPlaybackSample = (
  playbackSample: number,
  project: Project,
  cueBeat: number
): number => {
  const playbackBeat = playbackSample / samplesPerBeat(project.global.sampleRate, project.global.tempo);
  return getSongBeatForPlaybackBeat(playbackBeat, cueBeat, project.global.loop);
};
