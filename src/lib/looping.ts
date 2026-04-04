import { beatToSample, samplesPerBeat } from "@/lib/musicTiming";
import { createId } from "@/lib/ids";
import { insertBeatGap, sortNotes } from "@/lib/noteEditing";
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

export interface MatchedLoopRegion {
  startMarkerId: string;
  endMarkerId: string;
  startBeat: number;
  endBeat: number;
  repeatCount: number;
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

interface LoopPassLengths {
  currentPassLength: number;
  repeatedPassLength: number;
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

const toMatchedLoopRegion = (pair: LoopPair): MatchedLoopRegion => ({
  startMarkerId: pair.startMarkerId,
  endMarkerId: pair.endMarkerId,
  startBeat: pair.startBeat,
  endBeat: pair.endBeat,
  repeatCount: pair.repeatCount
});

const flattenLoopPairs = (pairs: LoopPair[]): LoopPair[] =>
  pairs.flatMap((pair) => [pair, ...flattenLoopPairs(pair.children)]);

export const getMatchedLoopRegionsAtBeat = (
  loop: ProjectGlobalSettings["loop"],
  beat: number
): MatchedLoopRegion[] =>
  flattenLoopPairs(buildLoopPairs(loop).pairs)
    .filter((pair) => Math.abs(pair.startBeat - beat) < EPSILON || Math.abs(pair.endBeat - beat) < EPSILON)
    .map(toMatchedLoopRegion);

export const getUniqueMatchedLoopRegionAtBeat = (
  loop: ProjectGlobalSettings["loop"],
  beat: number
): MatchedLoopRegion | null => {
  const matches = getMatchedLoopRegionsAtBeat(loop, beat);
  return matches.length === 1 ? matches[0] : null;
};

const getLoopPassLengths = (pair: LoopPair, currentPassStartBeat: number): LoopPassLengths => ({
  currentPassLength: getSequencePlaybackLength(currentPassStartBeat, pair.endBeat, pair.children),
  repeatedPassLength: getSequencePlaybackLength(pair.startBeat, pair.endBeat, pair.children)
});

const collectRepeatedPassOffsets = (
  songBeat: number,
  pair: LoopPair
): number[] => {
  const offsets: number[] = [];
  collectPlaybackBeatsInSequence(songBeat, pair.startBeat, pair.endBeat, pair.children, 0, offsets);
  return offsets;
};

const pushRepeatedPassResults = (
  results: number[],
  offsets: number[],
  firstPlaybackBeat: number,
  repeatedPassLength: number,
  repeatCount: number
): void => {
  for (let passIndex = 0; passIndex < repeatCount; passIndex += 1) {
    const passPlaybackStart = firstPlaybackBeat + passIndex * repeatedPassLength;
    for (const bodyOffset of offsets) {
      results.push(passPlaybackStart + bodyOffset);
    }
  }
};

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

    const { currentPassLength, repeatedPassLength } = getLoopPassLengths(child, childStartBeat);
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
      // The target beat lands before the next loop body begins in the audible
      // sequence. It can either belong to the plain gap we are currently walking,
      // or to a later repeated pass of a loop that started before the cue point.
      if (songBeat >= cursorSong - EPSILON && songBeat < childStartBeat - EPSILON) {
        results.push(cursorPlayback + (songBeat - cursorSong));
        return;
      }

      if (songBeat >= child.startBeat - EPSILON && songBeat <= child.endBeat + EPSILON && child.repeatCount > 0) {
        const { currentPassLength, repeatedPassLength } = getLoopPassLengths(child, childStartBeat);
        const repeatedPassOffsets = collectRepeatedPassOffsets(songBeat, child);
        pushRepeatedPassResults(results, repeatedPassOffsets, cursorPlayback + currentPassLength, repeatedPassLength, child.repeatCount);
      }
      return;
    }

    if (childStartBeat > cursorSong + EPSILON) {
      cursorPlayback += childStartBeat - cursorSong;
      cursorSong = childStartBeat;
    }

    if (songBeat <= child.endBeat + EPSILON) {
      // The target beat belongs to this loop body. First collect where it lands in
      // the currently audible pass, then mirror that same musical position into any
      // later repeated passes of the same loop body.
      const { currentPassLength, repeatedPassLength } = getLoopPassLengths(child, childStartBeat);
      const currentPassOffsets: number[] = [];
      collectPlaybackBeatsInSequence(songBeat, childStartBeat, child.endBeat, child.children, 0, currentPassOffsets);
      for (const bodyOffset of currentPassOffsets) {
        results.push(cursorPlayback + bodyOffset);
      }

      if (child.repeatCount > 0) {
        const repeatedPassOffsets = collectRepeatedPassOffsets(songBeat, child);
        pushRepeatedPassResults(results, repeatedPassOffsets, cursorPlayback + currentPassLength, repeatedPassLength, child.repeatCount);
      }
      return;
    }

    // This loop body is completely before the target beat in song time, so advance
    // both cursors by the audible length of its current pass plus any repeats.
    const { currentPassLength, repeatedPassLength } = getLoopPassLengths(child, childStartBeat);
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

    const { currentPassLength, repeatedPassLength } = getLoopPassLengths(child, childStartBeat);
    if (remaining < currentPassLength - EPSILON) {
      return mapPlaybackBeatInSequence(remaining, childStartBeat, child.endBeat, child.children);
    }
    if (Math.abs(remaining - currentPassLength) <= EPSILON) {
      remaining = 0;
      cursorSong = child.endBeat;
      continue;
    }

    remaining -= currentPassLength;

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

const findLoopPairByMarkerId = (pairs: LoopPair[], markerId: string): LoopPair | null => {
  for (const pair of pairs) {
    if (pair.startMarkerId === markerId || pair.endMarkerId === markerId) {
      return pair;
    }
    const childMatch = findLoopPairByMarkerId(pair.children, markerId);
    if (childMatch) {
      return childMatch;
    }
  }
  return null;
};

const collectLoopPairMarkerIds = (pair: LoopPair): Set<string> => {
  const markerIds = new Set<string>([pair.startMarkerId, pair.endMarkerId]);
  for (const child of pair.children) {
    for (const markerId of collectLoopPairMarkerIds(child)) {
      markerIds.add(markerId);
    }
  }
  return markerIds;
};

const filterPlaybackBeatsInRange = (beats: number[], totalExpandedLength: number, includeEndBoundary: boolean): number[] =>
  beats.filter((beat) =>
    includeEndBoundary
      ? beat >= -EPSILON && beat <= totalExpandedLength + EPSILON
      : beat >= -EPSILON && beat < totalExpandedLength - EPSILON
  );

export const expandLoopRegionToNotes = (
  project: Project,
  region: MatchedLoopRegion
): Project => {
  const { pairs } = buildLoopPairs(project.global.loop);
  const targetPair = findLoopPairByMarkerId(pairs, region.startMarkerId);
  if (
    !targetPair ||
    targetPair.endMarkerId !== region.endMarkerId ||
    Math.abs(targetPair.startBeat - region.startBeat) >= EPSILON ||
    Math.abs(targetPair.endBeat - region.endBeat) >= EPSILON
  ) {
    return project;
  }

  const loopBodyPlaybackLength = getSequencePlaybackLength(targetPair.startBeat, targetPair.endBeat, targetPair.children);
  const totalExpandedLength = loopBodyPlaybackLength * (targetPair.repeatCount + 1);
  const rawLoopLength = targetPair.endBeat - targetPair.startBeat;
  const shiftAmount = totalExpandedLength - rawLoopLength;

  if (shiftAmount <= EPSILON) {
    return {
      ...project,
      global: {
        ...project.global,
        loop: sanitizeLoopSettings(
          project.global.loop.filter(
            (marker) => marker.id !== targetPair.startMarkerId && marker.id !== targetPair.endMarkerId
          )
        )
      }
    };
  }

  // Exploding a loop flattens the full audible subtree for that region, so any
  // nested loop markers inside the selected pair become redundant and are removed too.
  const removedMarkerIds = collectLoopPairMarkerIds(targetPair);
  const nextLoop = sanitizeLoopSettings(
    project.global.loop
      .filter((marker) => {
        if (removedMarkerIds.has(marker.id)) {
          return false;
        }
        return marker.beat <= targetPair.startBeat + EPSILON || marker.beat >= targetPair.endBeat - EPSILON;
      })
      .map((marker) =>
        marker.beat >= targetPair.endBeat - EPSILON
          ? { ...marker, beat: marker.beat + shiftAmount }
          : marker
      )
  );

  return {
    ...project,
    global: {
      ...project.global,
      loop: nextLoop
    },
    tracks: project.tracks.map((track) => {
      const beforeLoop = track.notes.filter((note) => note.startBeat < targetPair.startBeat - EPSILON);
      const insideLoop = track.notes.filter(
        (note) => note.startBeat >= targetPair.startBeat - EPSILON && note.startBeat < targetPair.endBeat - EPSILON
      );
      const afterLoop = insertBeatGap(
        track.notes.filter((note) => note.startBeat >= targetPair.endBeat - EPSILON),
        targetPair.endBeat,
        shiftAmount
      );

      const expandedNotes = insideLoop.flatMap((note) => {
        const startOffsets = filterPlaybackBeatsInRange(
          getLoopedPlaybackBeatsForSongBeat(note.startBeat, targetPair.startBeat, project.global.loop),
          totalExpandedLength,
          false
        );
        const endOffsets = filterPlaybackBeatsInRange(
          getLoopedPlaybackBeatsForSongBeat(note.startBeat + note.durationBeats, targetPair.startBeat, project.global.loop),
          totalExpandedLength,
          true
        );

        return startOffsets.map((startOffset, index) => {
          const endOffset = endOffsets[index];
          if (typeof endOffset !== "number" || endOffset <= startOffset + EPSILON) {
            return null;
          }
          return {
            ...note,
            id: index === 0 ? note.id : createId("note"),
            startBeat: targetPair.startBeat + startOffset,
            durationBeats: endOffset - startOffset
          };
        }).filter((note): note is Note => Boolean(note));
      });

      return {
        ...track,
        notes: sortNotes([...beforeLoop, ...expandedNotes, ...afterLoop])
      };
    })
  };
};
