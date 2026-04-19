import { createId } from "@/lib/ids";
import { createDefaultProject, createEmptyProject } from "@/lib/patch/presets";
import { createAvailableProjectName } from "@/lib/projectManagement";
import { Project } from "@/types/music";

const withUpdatedTimestamp = (project: Project): Project => ({
  ...project,
  updatedAt: Date.now()
});

export const createProjectSnapshot = (project: Project): Project => withUpdatedTimestamp(project);

export const createNamedEmptyProject = (reservedNames: string[]): Project => {
  const nextProject = createEmptyProject();

  return {
    ...nextProject,
    name: createAvailableProjectName(reservedNames),
    updatedAt: Date.now()
  };
};

export const createClearedProject = (project: Project): Project => {
  const clearedProject = createEmptyProject();

  return {
    ...clearedProject,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: Date.now()
  };
};

export const createResetProject = (): Project => withUpdatedTimestamp(createDefaultProject());

export const prepareImportedProject = (project: Project): Project => ({
  ...project,
  id: createId("project"),
  updatedAt: Date.now()
});
