import { AudioProject } from "@/types/audio";
import { hydratePatchSamplePlayerAssetsForRuntime } from "@/lib/sampleAssetLibrary";
import { Project } from "@/types/music";
import { ProjectAssetLibrary } from "@/types/assets";

export const toAudioProject = (project: Project, assets: ProjectAssetLibrary): AudioProject => ({
  global: project.global,
  tracks: project.tracks,
  patches: project.patches.map((patch) => hydratePatchSamplePlayerAssetsForRuntime(patch, assets)),
  masterFx: project.masterFx
});
