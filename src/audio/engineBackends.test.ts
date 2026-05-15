import { describe, expect, it } from "vitest";

import { collectLiveMuteTransitionEvents } from "@/audio/engineBackends";
import { TRACK_VOLUME_AUTOMATION_ID } from "@/lib/macroAutomation";
import { createDefaultProject } from "@/lib/patch/presets";
import { AudioProject } from "@/types/audio";

const cloneProject = (project: AudioProject): AudioProject => structuredClone(project);

describe("audio engine live mute transitions", () => {
  it("releases timeline notes and drops track volume when a track is muted during playback", () => {
    const previousProject = createDefaultProject();
    previousProject.tracks[0].notes = [
      {
        id: "note_1",
        pitchStr: "C3",
        startBeat: 0,
        durationBeats: 4,
        velocity: 0.8
      },
      {
        id: "note_2",
        pitchStr: "G3",
        startBeat: 2,
        durationBeats: 4,
        velocity: 0.9
      }
    ];
    const nextProject = cloneProject(previousProject);
    const track = nextProject.tracks[0];
    track.mute = true;

    const events = collectLiveMuteTransitionEvents(previousProject, nextProject, 2048, 1);

    expect(events).toEqual([
      expect.objectContaining({
        type: "NoteOff",
        sampleTime: 2048,
        trackId: track.id,
        noteId: "note_1"
      }),
      expect.objectContaining({
        type: "NoteOff",
        sampleTime: 2048,
        trackId: track.id,
        noteId: "note_2"
      }),
      expect.objectContaining({
        type: "MacroChange",
        sampleTime: 2048,
        trackId: track.id,
        macroId: TRACK_VOLUME_AUTOMATION_ID,
        normalized: 0
      })
    ]);
  });

  it("restores the current track volume when a track is unmuted during playback", () => {
    const previousProject = createDefaultProject();
    previousProject.tracks[0].mute = true;
    const nextProject = cloneProject(previousProject);
    const track = nextProject.tracks[0];
    track.mute = false;
    track.volume = 1.5;

    const events = collectLiveMuteTransitionEvents(previousProject, nextProject, 4096, 2);

    expect(events).toEqual([
      expect.objectContaining({
        type: "MacroChange",
        sampleTime: 4096,
        trackId: track.id,
        macroId: TRACK_VOLUME_AUTOMATION_ID,
        normalized: 0.75
      })
    ]);
  });

  it("does not emit events when mute state is unchanged", () => {
    const previousProject = createDefaultProject();
    const nextProject = cloneProject(previousProject);

    expect(collectLiveMuteTransitionEvents(previousProject, nextProject, 1024, 0)).toEqual([]);
  });
});
