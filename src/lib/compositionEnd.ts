import { getProjectLastNoteEndBeat, getProjectTimelineEndBeat } from "@/lib/macroAutomation";
import type { Project } from "@/types/music";

export const clearFixedCompositionEnd = (project: Project): Project => {
  if (!project.global.compositionEnd) {
    return project;
  }
  const global = { ...project.global };
  delete global.compositionEnd;
  return { ...project, global };
};

export const setFixedCompositionEndBeat = (project: Project, beat: number): Project => ({
  ...project,
  global: {
    ...project.global,
    compositionEnd: {
      mode: "fixed",
      beat: Math.max(getProjectLastNoteEndBeat(project), beat)
    }
  }
});

export const shiftFixedCompositionEndForInsertedRange = (
  project: Project,
  startBeat: number,
  gapBeats: number,
  currentEndBeat = getProjectTimelineEndBeat(project)
): Project => {
  if (!project.global.compositionEnd || gapBeats <= 0) {
    return project;
  }
  return setFixedCompositionEndBeat(project, startBeat <= currentEndBeat ? currentEndBeat + gapBeats : currentEndBeat);
};

export const shiftFixedCompositionEndForRemovedRange = (
  project: Project,
  startBeat: number,
  endBeat: number,
  currentEndBeat = getProjectTimelineEndBeat(project)
): Project => {
  if (!project.global.compositionEnd || endBeat <= startBeat) {
    return project;
  }
  if (endBeat >= currentEndBeat) {
    return setFixedCompositionEndBeat(project, startBeat);
  }
  if (startBeat < currentEndBeat) {
    return setFixedCompositionEndBeat(project, currentEndBeat - (endBeat - startBeat));
  }
  return project;
};
