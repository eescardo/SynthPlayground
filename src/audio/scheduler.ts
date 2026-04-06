import { getLoopedPlaybackBeatsForSongBeat } from "@/lib/looping";
import { getProjectTimelineEndBeat, getTrackMacroValueAtBeat, isTrackMacroAutomated } from "@/lib/macroAutomation";
import { beatRangeToSampleRange } from "@/lib/musicTiming";
import { pitchToVoct } from "@/lib/pitch";
import { createId } from "@/lib/ids";
import { Project } from "@/types/music";
import { SchedulerEvent, SchedulerEventType } from "@/types/audio";

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

enum SchedulerEventSortPriority {
  NoteOff = 0,
  ParamChange = 1,
  MacroChange = 2,
  NoteOn = 3
}

// When multiple events land on the same sample, we need deterministic ordering.
// NoteOff runs first so a note ending exactly on a boundary releases before any
// same-sample retrigger. Param changes land before NoteOn so fresh note attacks
// see the latest parameter targets for that sample.
const SCHEDULER_EVENT_SORT_PRIORITY: Record<SchedulerEventType, SchedulerEventSortPriority> = {
  NoteOff: SchedulerEventSortPriority.NoteOff,
  ParamChange: SchedulerEventSortPriority.ParamChange,
  MacroChange: SchedulerEventSortPriority.MacroChange,
  NoteOn: SchedulerEventSortPriority.NoteOn
};

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
  const timelineEndBeat = getProjectTimelineEndBeat(project);
  const automationStepBeats = 0.125;

  for (const track of project.tracks) {
    if (track.mute) {
      continue;
    }

    const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
    if (patch) {
      for (const macro of patch.ui.macros) {
        if (!isTrackMacroAutomated(track, macro.id)) {
          continue;
        }
        for (let beat = 0; beat <= timelineEndBeat + 1e-9; beat += automationStepBeats) {
          const sampleTimes = getLoopedEventSampleTimes(beat, cueBeat, project);
          const normalized = getTrackMacroValueAtBeat(track, macro.id, macro.defaultNormalized ?? 0.5, beat, timelineEndBeat);
          sampleTimes.forEach((sampleTime, index) => {
            if (sampleTime < window.fromSample || sampleTime >= window.toSample) {
              return;
            }
            events.push({
              id: `${track.id}:${macro.id}:automation:${beat.toFixed(4)}:${index}`,
              type: "MacroChange",
              source: "automation",
              sampleTime,
              trackId: track.id,
              macroId: macro.id,
              normalized
            });
          });
        }
      }
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
    const priorityDelta = SCHEDULER_EVENT_SORT_PRIORITY[a.type] - SCHEDULER_EVENT_SORT_PRIORITY[b.type];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return a.id.localeCompare(b.id);
  });
  return events;
};
