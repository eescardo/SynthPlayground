import {
  eraseAutomationLaneBeatRange,
  insertAutomationLaneGap,
  removeAutomationLaneBeatRangeAndCloseGap,
  replaceAutomationLaneBeatRange
} from "@/lib/automationTimelineEditing";
import { createId } from "@/lib/ids";
import { sanitizeLoopSettings } from "@/lib/looping";
import { eraseNotesInBeatRange, insertBeatGap, removeBeatRangeAndCloseGap, sortNotes } from "@/lib/noteEditing";
import { BeatRange, getNoteSelectionKey, getSelectedAutomationIdsByTrackId } from "@/lib/clipboard/selection";
import { NoteClipboardPayload } from "@/lib/clipboard/payload";
import { Note, Project, Track } from "@/types/music";

export interface AppliedNoteClipboardPaste {
  project: Project;
  selection: {
    noteKeys: string[];
    automationKeyframeSelectionKeys: string[];
  };
}

const buildInsertedNotes = (
  track: Track,
  playheadBeat: number,
  copiedTrack: NoteClipboardPayload["tracks"][number]
) => {
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

const getCompatibleMacroIds = (project: Project, track: Track, sourcePatchId: string) => {
  if (track.instrumentPatchId !== sourcePatchId) {
    return new Set<string>();
  }

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

const getProjectTimelineEndBeat = (project: Project, fallbackEndBeat = 0) =>
  Math.max(
    project.tracks
      .flatMap((track) => track.notes)
      .reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0),
    fallbackEndBeat
  );

const getDestinationTracks = (project: Project, selectedTrackId: string, trackCount: number) => {
  const startTrackIndex = project.tracks.findIndex((track) => track.id === selectedTrackId);
  if (startTrackIndex < 0 || trackCount <= 0) {
    return [];
  }

  return project.tracks.slice(startTrackIndex, startTrackIndex + trackCount);
};

export function applyNoteClipboardPaste(
  project: Project,
  payload: NoteClipboardPayload,
  selectedTrackId: string,
  playheadBeat: number
): AppliedNoteClipboardPaste {
  const destinationTracks = getDestinationTracks(project, selectedTrackId, payload.tracks.length);
  if (destinationTracks.length === 0) {
    return { project, selection: { noteKeys: [], automationKeyframeSelectionKeys: [] } };
  }

  const insertedByTrackId = new Map(
    destinationTracks.map(
      (track, index) => [track.id, buildInsertedNotes(track, playheadBeat, payload.tracks[index]!)] as const
    )
  );
  const pastedTrackDataByTrackId = new Map(
    destinationTracks.map((track, index) => [track.id, payload.tracks[index]!] as const)
  );
  const pasteEndBeat = playheadBeat + payload.beatSpan;
  const selection = {
    noteKeys: [] as string[],
    automationKeyframeSelectionKeys: [] as string[]
  };
  const timelineEndBeat = getProjectTimelineEndBeat(project, pasteEndBeat);

  const tracks = project.tracks.map((track) => {
    const inserted = insertedByTrackId.get(track.id);
    const copiedTrack = pastedTrackDataByTrackId.get(track.id);
    if (!inserted || !copiedTrack) {
      return track;
    }

    const cleared = eraseNotesInBeatRange(track.notes, playheadBeat, pasteEndBeat);
    for (const note of inserted.notes) {
      selection.noteKeys.push(getNoteSelectionKey(track.id, note.id));
    }

    let nextTrack: Track = {
      ...track,
      notes: sortNotes([...cleared, ...inserted.notes])
    };

    if (copiedTrack.automationLanes.length > 0) {
      const compatibleMacroIds = getCompatibleMacroIds(project, track, copiedTrack.sourcePatchId);
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
    selection
  };
}

export function applyNoteClipboardInsert(
  project: Project,
  payload: NoteClipboardPayload,
  selectedTrackId: string,
  playheadBeat: number
): AppliedNoteClipboardPaste {
  const timelineEndBeat = getProjectTimelineEndBeat(project);
  const destinationTrackIds = new Set(
    getDestinationTracks(project, selectedTrackId, payload.tracks.length).map((track) => track.id)
  );
  if (destinationTrackIds.size === 0) {
    return { project, selection: { noteKeys: [], automationKeyframeSelectionKeys: [] } };
  }

  const shiftedProject = {
    ...project,
    tracks: project.tracks.map((track) =>
      destinationTrackIds.has(track.id)
        ? {
            ...track,
            notes: insertBeatGap(track.notes, playheadBeat, payload.beatSpan),
            macroAutomations: Object.fromEntries(
              Object.entries(track.macroAutomations).map(([macroId, lane]) => [
                macroId,
                insertAutomationLaneGap(lane, playheadBeat, payload.beatSpan, timelineEndBeat)
              ])
            )
          }
        : track
    )
  };
  return applyNoteClipboardPaste(shiftedProject, payload, selectedTrackId, playheadBeat);
}

export function applyNoteClipboardInsertAllTracks(
  project: Project,
  payload: NoteClipboardPayload,
  playheadBeat: number
): AppliedNoteClipboardPaste {
  const firstTrackId = project.tracks[0]?.id;
  if (!firstTrackId) {
    return { project, selection: { noteKeys: [], automationKeyframeSelectionKeys: [] } };
  }
  const timelineEndBeat = getProjectTimelineEndBeat(project);
  const shiftedProject = shiftBeatBoundSongStructureForInsertedGap(
    {
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
    },
    playheadBeat,
    payload.beatSpan
  );
  return applyNoteClipboardPaste(shiftedProject, payload, firstTrackId, playheadBeat);
}

export function cutBeatRangeAcrossAllTracks(project: Project, range: BeatRange): Project {
  const timelineEndBeat = getProjectTimelineEndBeat(project, range.endBeat);
  return shiftBeatBoundSongStructureForRemovedRange(
    {
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
    },
    range.startBeat,
    range.endBeat
  );
}

export function eraseAutomationInRangeForTracks(
  project: Project,
  range: BeatRange,
  trackIds: Iterable<string>
): Project {
  const selectedTrackIds = new Set(trackIds);
  const timelineEndBeat = getProjectTimelineEndBeat(project, range.endBeat);
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
