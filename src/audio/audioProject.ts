import { AudioProject } from "@/types/audio";
import { Project } from "@/types/music";
import { ProjectAssetLibrary } from "@/types/assets";

export const toAudioProject = (project: Project, assets: ProjectAssetLibrary): AudioProject => ({
  global: project.global,
  tracks: project.tracks,
  patches: project.patches,
  masterFx: project.masterFx,
  sampleAssets: assets
});
