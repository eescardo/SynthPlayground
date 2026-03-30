import { getLoopedPlaybackBeatsForSongBeat } from "@/lib/looping";
import { beatRangeToSampleRange } from "@/lib/musicTiming";
import { pitchToVoct } from "@/lib/pitch";
import { createId } from "@/lib/ids";
import { Project } from "@/types/music";
import { SchedulerEvent } from "@/types/audio";

interface SchedulerWindow {
  fromSample: number;
  toSample: number;
}

interface CollectEventsOptions {
  cueBeat?: number;
}

interface NoteEventCache {
  onEventId: string;
  offEventId: string;
}

const stableNoteEventIds = new Map<string, NoteEventCache>();

const pruneStaleNoteEventIds = (project: Project): void => {
  const activeKeys = new Set<string>();
  for (const track of project.tracks) {
    for (const note of track.notes) {
      activeKeys.add(`${track.id}:${note.id}`);
    }
  }

  for (const key of stableNoteEventIds.keys()) {
    if (!activeKeys.has(key)) {
      stableNoteEventIds.delete(key);
    }
  }
};

const noteEventCacheFor = (trackId: string, noteId: string): NoteEventCache => {
  const key = `${trackId}:${noteId}`;
  const existing = stableNoteEventIds.get(key);
  if (existing) {
    return existing;
  }
  const created = {
    onEventId: createId("on"),
    offEventId: createId("off")
  };
  stableNoteEventIds.set(key, created);
  return created;
};

const getLoopedEventSampleTimes = (songBeat: number, cueBeat: number, project: Project): number[] => {
  const playbackBeatTimes = getLoopedPlaybackBeatsForSongBeat(songBeat, cueBeat, project.global.loop);
  return playbackBeatTimes.map((beatOffset) => beatRangeToSampleRange(beatOffset, 0, project.global.sampleRate, project.global.tempo).startSample);
};

export const collectEventsInWindow = (project: Project, window: SchedulerWindow, options?: CollectEventsOptions): SchedulerEvent[] => {
  pruneStaleNoteEventIds(project);
  const events: SchedulerEvent[] = [];
  const cueBeat = Math.max(0, options?.cueBeat ?? 0);

  for (const track of project.tracks) {
    if (track.mute) {
      continue;
    }

    for (const note of track.notes) {
      const voct = pitchToVoct(note.pitchStr);
      const ids = noteEventCacheFor(track.id, note.id);
      const startBeatTimes = getLoopedEventSampleTimes(note.startBeat, cueBeat, project);
      const endBeatTimes = getLoopedEventSampleTimes(note.startBeat + note.durationBeats, cueBeat, project);

      startBeatTimes.forEach((sampleTime, index) => {
        if (sampleTime < window.fromSample || sampleTime >= window.toSample) {
          return;
        }
        events.push({
          id: index === 0 ? ids.onEventId : `${ids.onEventId}_loop_${index}`,
          type: "NoteOn",
          source: "timeline",
          sampleTime,
          trackId: track.id,
          pitchVoct: voct,
          velocity: note.velocity,
          noteId: note.id
        });
      });

      endBeatTimes.forEach((sampleTime, index) => {
        if (sampleTime < window.fromSample || sampleTime >= window.toSample) {
          return;
        }
        events.push({
          id: index === 0 ? ids.offEventId : `${ids.offEventId}_loop_${index}`,
          type: "NoteOff",
          source: "timeline",
          sampleTime,
          trackId: track.id,
          pitchVoct: voct,
          noteId: note.id
        });
      });
    }
  }

  events.sort((a, b) => {
    if (a.sampleTime !== b.sampleTime) {
      return a.sampleTime - b.sampleTime;
    }
    if (a.type === b.type) {
      return a.id.localeCompare(b.id);
    }
    if (a.type === "NoteOff") {
      return -1;
    }
    if (b.type === "NoteOff") {
      return 1;
    }
    return a.id.localeCompare(b.id);
  });
  return events;
};
