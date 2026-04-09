import { Project, Track } from "@/types/music";

export interface BeatRange {
  startBeat: number;
  endBeat: number;
  beatSpan: number;
}

export interface ContentSelection {
  noteKeys: string[];
  automationKeyframeKeys: string[];
}

export const EMPTY_CONTENT_SELECTION: ContentSelection = {
  noteKeys: [],
  automationKeyframeKeys: []
};

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

export const getSelectedNoteIdsByTrackId = (selectionKeys: Iterable<string>) => {
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

export const getSelectedAutomationIdsByTrackId = (selectionKeys: Iterable<string>) => {
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

export const getSelectedTrackIds = (selection: ContentSelection) => {
  const trackIds = new Set<string>();
  for (const key of selection.noteKeys) {
    const parsed = parseNoteSelectionKey(key);
    if (parsed) {
      trackIds.add(parsed.trackId);
    }
  }
  for (const key of selection.automationKeyframeKeys) {
    const parsed = parseAutomationSelectionKey(key);
    if (parsed) {
      trackIds.add(parsed.trackId);
    }
  }
  return trackIds;
};

export const getContentSelectionLabel = (tracks: Track[], selection: ContentSelection) => {
  const selectedTrackIds = getSelectedTrackIds(selection);
  const selectedTrackNames = tracks.filter((track) => selectedTrackIds.has(track.id)).map((track) => track.name);

  if (selectedTrackNames.length === 0) {
    return "Track 1";
  }
  if (selectedTrackNames.length === 1) {
    return selectedTrackNames[0]!;
  }
  return `${selectedTrackNames[0]}-${selectedTrackNames[selectedTrackNames.length - 1]}`;
};
