import { describe, expect, it } from "vitest";

import { getTrackMuteForVolumeChange } from "@/hooks/useProjectAudioActions";
import { createDefaultProject } from "@/lib/patch/presets";

describe("project audio actions", () => {
  it("detects volume changes that should unmute a muted track", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.mute = true;
    track.volume = 0;

    expect(getTrackMuteForVolumeChange(project, track.id, 0.75)).toEqual({
      muted: false,
      changed: true
    });
  });

  it("detects volume changes that should mute an audible track", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.mute = false;
    track.volume = 0.75;

    expect(getTrackMuteForVolumeChange(project, track.id, 0)).toEqual({
      muted: true,
      changed: true
    });
  });

  it("does not report a mute transition when volume stays audible", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.mute = false;

    expect(getTrackMuteForVolumeChange(project, track.id, 1)).toEqual({
      muted: false,
      changed: false
    });
  });
});
