import { Project } from "@/types/music";

export const renameTrackInProject = (project: Project, trackId: string, name: string): Project => {
  const trimmed = name.trim();
  if (!trimmed) {
    return project;
  }

  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId || track.name === trimmed) {
      return track;
    }
    changed = true;
    return { ...track, name: trimmed };
  });

  return changed ? { ...project, tracks } : project;
};

export const removeTrackFromProject = (project: Project, trackId: string): Project => {
  if (project.tracks.length <= 1 || !project.tracks.some((track) => track.id === trackId)) {
    return project;
  }

  return {
    ...project,
    tracks: project.tracks.filter((track) => track.id !== trackId)
  };
};

export const switchTrackPatchInProject = (project: Project, trackId: string, patchId: string): Project => {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId || track.instrumentPatchId === patchId) {
      return track;
    }

    changed = true;
    return {
      ...track,
      instrumentPatchId: patchId,
      macroValues: {},
      macroAutomations: {}
    };
  });

  return changed ? { ...project, tracks } : project;
};
