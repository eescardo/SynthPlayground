import { getProjectLastNoteEndBeat, getProjectTimelineEndBeat } from "@/lib/macroAutomation";
import type { Project } from "@/types/music";

type CompositionEndMode = NonNullable<Project["global"]["compositionEnd"]>["mode"];

export const clearCompositionEndOverride = (project: Project): Project => {
  if (!project.global.compositionEnd) {
    return project;
  }
  const global = { ...project.global };
  delete global.compositionEnd;
  return { ...project, global };
};

export const setCompositionEndBeat = (
  project: Project,
  beat: number,
  mode: CompositionEndMode = project.global.compositionEnd?.mode ?? "follow"
): Project => ({
  ...project,
  global: {
    ...project.global,
    compositionEnd: {
      mode,
      beat: Math.max(getProjectLastNoteEndBeat(project), beat)
    }
  }
});

export const setFixedCompositionEndBeat = (project: Project, beat: number): Project =>
  setCompositionEndBeat(project, beat, "fixed");

export const shiftCompositionEndForInsertedRange = (
  project: Project,
  startBeat: number,
  gapBeats: number,
  currentEndBeat = getProjectTimelineEndBeat(project)
): Project => {
  if (gapBeats <= 0 || (!project.global.compositionEnd && startBeat > currentEndBeat)) {
    return project;
  }
  return setCompositionEndBeat(project, startBeat <= currentEndBeat ? currentEndBeat + gapBeats : currentEndBeat);
};

export const shiftCompositionEndForRemovedRange = (
  project: Project,
  startBeat: number,
  endBeat: number,
  currentEndBeat = getProjectTimelineEndBeat(project)
): Project => {
  if (endBeat <= startBeat || (!project.global.compositionEnd && startBeat >= currentEndBeat)) {
    return project;
  }
  if (endBeat >= currentEndBeat) {
    return setCompositionEndBeat(project, startBeat);
  }
  if (startBeat < currentEndBeat) {
    return setCompositionEndBeat(project, currentEndBeat - (endBeat - startBeat));
  }
  return project;
};

export const clearFollowCompositionEndOverrideAfterLastNoteEndChange = (
  previousProject: Project,
  nextProject: Project,
  preserveFollowOverride = false
): Project => {
  if (
    preserveFollowOverride ||
    previousProject.global.compositionEnd?.mode !== "follow" ||
    nextProject.global.compositionEnd?.mode !== "follow" ||
    getProjectLastNoteEndBeat(previousProject) === getProjectLastNoteEndBeat(nextProject)
  ) {
    return nextProject;
  }
  return clearCompositionEndOverride(nextProject);
};
