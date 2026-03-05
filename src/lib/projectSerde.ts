import { Project } from "@/types/music";

export const exportProjectToJson = (project: Project): string => JSON.stringify(project, null, 2);

export const importProjectFromJson = (json: string): Project => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Project JSON root must be object");
  }

  const project = parsed as Project;
  if (!project.global || !Array.isArray(project.tracks) || !Array.isArray(project.patches)) {
    throw new Error("Project JSON missing required fields");
  }

  if (project.global.sampleRate !== 48000) {
    project.global.sampleRate = 48000;
  }

  return project;
};
