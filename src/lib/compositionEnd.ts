import { getProjectLastNoteEndBeat, getProjectTimelineEndBeat } from "@/lib/macroAutomation";
import type { Project } from "@/types/music";

export const clearCompositionEndBeat = (project: Project): Project => {
  if (!project.global.compositionEnd) {
    return project;
  }
  const global = { ...project.global };
  delete global.compositionEnd;
  return { ...project, global };
};

export const setCompositionEndBeat = (project: Project, beat: number): Project => ({
  ...project,
  global: {
    ...project.global,
    compositionEnd: {
      beat: Math.max(getProjectLastNoteEndBeat(project), beat)
    }
  }
});

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
