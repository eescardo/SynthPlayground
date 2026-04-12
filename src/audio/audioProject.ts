import { AudioProject } from "@/types/audio";
import { Project } from "@/types/music";

export const toAudioProject = (project: Project): AudioProject => ({
  id: project.id,
  name: project.name,
  global: project.global,
  tracks: project.tracks,
  patches: project.patches,
  masterFx: project.masterFx,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt
});
