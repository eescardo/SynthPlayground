import { getLoopedPlaybackBeatsForSongBeat } from "@/lib/looping";
import {
  getProjectTimelineEndBeat,
  getTrackMacroValueAtBeat,
  isTrackMacroAutomated,
  isTrackVolumeAutomated,
  TRACK_VOLUME_AUTOMATION_ID
} from "@/lib/macroAutomation";
import { beatRangeToSampleRange, samplesPerBeat } from "@/lib/musicTiming";
import { pitchToVoct } from "@/lib/pitch";
import { createId } from "@/lib/ids";
import { AudioProject, SchedulerEvent, SchedulerEventType } from "@/types/audio";

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
const AUTOMATION_STEP_BEATS = 0.125;
const EPSILON = 1e-9;

const pruneStaleNoteEventIds = (project: AudioProject): void => {
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

const getLoopedEventSampleTimes = (songBeat: number, cueBeat: number, project: AudioProject): number[] => {
  const playbackBeatTimes = getLoopedPlaybackBeatsForSongBeat(songBeat, cueBeat, project.global.loop);
  return playbackBeatTimes.map((beatOffset) => beatRangeToSampleRange(beatOffset, 0, project.global.sampleRate, project.global.tempo).startSample);
};

const getUnloopedSongBeatWindow = (project: AudioProject, window: SchedulerWindow, cueBeat: number) => {
  const spb = samplesPerBeat(project.global.sampleRate, project.global.tempo);
  return {
    fromBeat: cueBeat + window.fromSample / spb,
    toBeat: cueBeat + window.toSample / spb
  };
};

const getAutomationStepWindow = (
  project: AudioProject,
  window: SchedulerWindow,
  cueBeat: number,
  timelineEndBeat: number
) => {
  if (project.global.loop.length > 0) {
    return {
      firstStep: 0,
      lastStep: Math.ceil(timelineEndBeat / AUTOMATION_STEP_BEATS)
    };
  }

  const { fromBeat, toBeat } = getUnloopedSongBeatWindow(project, window, cueBeat);
  return {
    firstStep: Math.max(0, Math.floor((fromBeat - EPSILON) / AUTOMATION_STEP_BEATS)),
    lastStep: Math.min(
      Math.ceil(timelineEndBeat / AUTOMATION_STEP_BEATS),
      Math.ceil((toBeat + EPSILON) / AUTOMATION_STEP_BEATS)
    )
  };
};

export const collectEventsInWindow = (project: AudioProject, window: SchedulerWindow, options?: CollectEventsOptions): SchedulerEvent[] => {
  pruneStaleNoteEventIds(project);
  const events: SchedulerEvent[] = [];
  const cueBeat = Math.max(0, options?.cueBeat ?? 0);
  const timelineEndBeat = getProjectTimelineEndBeat(project);
  const hasLoops = project.global.loop.length > 0;
  const unloopedBeatWindow = hasLoops ? null : getUnloopedSongBeatWindow(project, window, cueBeat);
  const automationStepWindow = getAutomationStepWindow(project, window, cueBeat, timelineEndBeat);

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
        for (let step = automationStepWindow.firstStep; step <= automationStepWindow.lastStep; step += 1) {
          const beat = step * AUTOMATION_STEP_BEATS;
          if (beat > timelineEndBeat + EPSILON) {
            continue;
          }
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

    if (isTrackVolumeAutomated(track)) {
      for (let step = automationStepWindow.firstStep; step <= automationStepWindow.lastStep; step += 1) {
        const beat = step * AUTOMATION_STEP_BEATS;
        if (beat > timelineEndBeat + EPSILON) {
          continue;
        }
        const sampleTimes = getLoopedEventSampleTimes(beat, cueBeat, project);
        const normalized = getTrackMacroValueAtBeat(
          track,
          TRACK_VOLUME_AUTOMATION_ID,
          track.volume / 2,
          beat,
          timelineEndBeat
        );
        sampleTimes.forEach((sampleTime, index) => {
          if (sampleTime < window.fromSample || sampleTime >= window.toSample) {
            return;
          }
          events.push({
            id: `${track.id}:${TRACK_VOLUME_AUTOMATION_ID}:automation:${beat.toFixed(4)}:${index}`,
            type: "MacroChange",
            source: "automation",
            sampleTime,
            trackId: track.id,
            macroId: TRACK_VOLUME_AUTOMATION_ID,
            normalized
          });
        });
      }
    }

    for (const note of track.notes) {
      const noteEndBeat = note.startBeat + note.durationBeats;
      const shouldCollectNoteOn =
        hasLoops || (
          note.startBeat >= (unloopedBeatWindow?.fromBeat ?? 0) - EPSILON &&
          note.startBeat < (unloopedBeatWindow?.toBeat ?? 0) + EPSILON
        );
      const shouldCollectNoteOff =
        hasLoops || (
          noteEndBeat >= (unloopedBeatWindow?.fromBeat ?? 0) - EPSILON &&
          noteEndBeat < (unloopedBeatWindow?.toBeat ?? 0) + EPSILON
        );
      if (!shouldCollectNoteOn && !shouldCollectNoteOff) {
        continue;
      }

      const ids = noteEventCacheFor(track.id, note.id);
      if (shouldCollectNoteOn) {
        const voct = pitchToVoct(note.pitchStr);
        const startBeatTimes = getLoopedEventSampleTimes(note.startBeat, cueBeat, project);
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
      }

      if (shouldCollectNoteOff) {
        const endBeatTimes = getLoopedEventSampleTimes(noteEndBeat, cueBeat, project);
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
            noteId: note.id
          });
        });
      }
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
