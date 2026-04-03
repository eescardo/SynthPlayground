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
  noteId: string;
  pitchStr: string;
  startBeat: number;
  endBeat: number;
  boundaryBeat: number;
  boundary: "start" | "end";
}

export interface LoopMarkerState {
  markerId: string;
  kind: "start" | "end";
  beat: number;
  repeatCount?: number;
  matched: boolean;
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
export const MAX_LOOP_REPEAT_COUNT = 16;

type LoopMarkerInput = ProjectGlobalSettings["loop"][number];

const clampRepeatCount = (repeatCount: unknown): number =>
  typeof repeatCount === "number" && Number.isFinite(repeatCount)
    ? Math.max(DEFAULT_LOOP_REPEAT_COUNT, Math.min(MAX_LOOP_REPEAT_COUNT, Math.round(repeatCount)))
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
    stateById.get(marker.id)!.matched = true;

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(pair);
    } else {
      pairs.push(pair);
    }
  }

  return {
    markerStates: states,
    pairs: pairs.sort((left, right) => left.startBeat - right.startBeat)
  };
};

export const getLoopMarkerStates = (
  loop: ProjectGlobalSettings["loop"]
): LoopMarkerState[] => buildLoopPairs(loop).markerStates;

const getSequencePlaybackLength = (startBeat: number, endBeat: number, children: LoopPair[]): number => {
  let total = 0;
  let cursor = startBeat;

  for (const child of children) {
    if (child.endBeat <= cursor + EPSILON) {
      continue;
    }

    const childStartBeat = Math.max(cursor, child.startBeat);
    if (childStartBeat > cursor + EPSILON) {
      total += childStartBeat - cursor;
    }

    const currentPassLength = getSequencePlaybackLength(childStartBeat, child.endBeat, child.children);
    const repeatedPassLength = getSequencePlaybackLength(child.startBeat, child.endBeat, child.children);
    total += currentPassLength;
    total += repeatedPassLength * child.repeatCount;
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
    if (child.endBeat <= cursorSong + EPSILON) {
      continue;
    }

    const childStartBeat = Math.max(cursorSong, child.startBeat);
    if (songBeat < childStartBeat - EPSILON) {
      if (songBeat >= cursorSong - EPSILON && songBeat < childStartBeat - EPSILON) {
        results.push(cursorPlayback + (songBeat - cursorSong));
      }
      return;
    }

    if (childStartBeat > cursorSong + EPSILON) {
      cursorPlayback += childStartBeat - cursorSong;
      cursorSong = childStartBeat;
    }

    if (songBeat < child.endBeat - EPSILON) {
      const currentPassLength = getSequencePlaybackLength(childStartBeat, child.endBeat, child.children);
      const currentPassOffsets: number[] = [];
      collectPlaybackBeatsInSequence(songBeat, childStartBeat, child.endBeat, child.children, 0, currentPassOffsets);
      for (const bodyOffset of currentPassOffsets) {
        results.push(cursorPlayback + bodyOffset);
      }

      if (child.repeatCount > 0) {
        const repeatedPassLength = getSequencePlaybackLength(child.startBeat, child.endBeat, child.children);
        const repeatedPassOffsets: number[] = [];
        collectPlaybackBeatsInSequence(songBeat, child.startBeat, child.endBeat, child.children, 0, repeatedPassOffsets);
        for (let passIndex = 0; passIndex < child.repeatCount; passIndex += 1) {
          const passPlaybackStart = cursorPlayback + currentPassLength + passIndex * repeatedPassLength;
          for (const bodyOffset of repeatedPassOffsets) {
            results.push(passPlaybackStart + bodyOffset);
          }
        }
      }
      return;
    }

    const currentPassLength = getSequencePlaybackLength(childStartBeat, child.endBeat, child.children);
    const repeatedPassLength = getSequencePlaybackLength(child.startBeat, child.endBeat, child.children);
    cursorPlayback += currentPassLength + repeatedPassLength * child.repeatCount;
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

const mapPlaybackBeatInSequence = (
  playbackBeat: number,
  startBeat: number,
  endBeat: number,
  children: LoopPair[]
): number => {
  let remaining = Math.max(0, playbackBeat);
  let cursorSong = startBeat;

  for (const child of children) {
    if (child.endBeat <= cursorSong + EPSILON) {
      continue;
    }

    const childStartBeat = Math.max(cursorSong, child.startBeat);
    const gap = Math.max(0, childStartBeat - cursorSong);
    if (remaining < gap - EPSILON) {
      return cursorSong + remaining;
    }
    remaining -= gap;
    cursorSong = childStartBeat;

    const currentPassLength = getSequencePlaybackLength(childStartBeat, child.endBeat, child.children);
    if (remaining < currentPassLength - EPSILON) {
      return mapPlaybackBeatInSequence(remaining, childStartBeat, child.endBeat, child.children);
    }
    if (Math.abs(remaining - currentPassLength) <= EPSILON) {
      remaining = 0;
      cursorSong = child.endBeat;
      continue;
    }

    remaining -= currentPassLength;

    const repeatedPassLength = getSequencePlaybackLength(child.startBeat, child.endBeat, child.children);
    const repeatedPassesLength = repeatedPassLength * child.repeatCount;
    if (repeatedPassLength > EPSILON && remaining < repeatedPassesLength - EPSILON) {
      const passOffset = remaining % repeatedPassLength;
      return mapPlaybackBeatInSequence(passOffset, child.startBeat, child.endBeat, child.children);
    }

    remaining -= repeatedPassesLength;
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
          noteId: note.id,
          pitchStr: note.pitchStr,
          startBeat: note.startBeat,
          endBeat,
          boundaryBeat: marker.beat,
          boundary: marker.kind
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
