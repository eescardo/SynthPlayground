import { AudioProject } from "@/types/audio";
import { Project } from "@/types/music";

export const toAudioProject = (project: Project): AudioProject => ({
  global: project.global,
  tracks: project.tracks,
  patches: project.patches,
  masterFx: project.masterFx
});
