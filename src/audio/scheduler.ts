import { beatRangeToSampleRange } from "@/lib/musicTiming";
import { pitchToVoct } from "@/lib/pitch";
import { createId } from "@/lib/ids";
import { Project } from "@/types/music";
import { SchedulerEvent } from "@/types/audio";

interface SchedulerWindow {
  fromSample: number;
  toSample: number;
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

export const collectEventsInWindow = (project: Project, window: SchedulerWindow): SchedulerEvent[] => {
  pruneStaleNoteEventIds(project);
  const events: SchedulerEvent[] = [];

  for (const track of project.tracks) {
    if (track.mute) {
      continue;
    }

    for (const note of track.notes) {
      const voct = pitchToVoct(note.pitchStr);
      const range = beatRangeToSampleRange(note.startBeat, note.durationBeats, project.global.sampleRate, project.global.tempo);
      const ids = noteEventCacheFor(track.id, note.id);

      if (range.startSample >= window.fromSample && range.startSample < window.toSample) {
        events.push({
          id: ids.onEventId,
          type: "NoteOn",
          source: "timeline",
          sampleTime: range.startSample,
          trackId: track.id,
          pitchVoct: voct,
          velocity: note.velocity,
          noteId: note.id
        });
      }

      if (range.endSample >= window.fromSample && range.endSample < window.toSample) {
        events.push({
          id: ids.offEventId,
          type: "NoteOff",
          source: "timeline",
          sampleTime: range.endSample,
          trackId: track.id,
          pitchVoct: voct,
          noteId: note.id
        });
      }
    }
  }

  events.sort((a, b) => a.sampleTime - b.sampleTime);
  return events;
};
