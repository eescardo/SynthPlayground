import { createId } from "@/lib/ids";
import { createDefaultProject, createEmptyProject } from "@/lib/patch/presets";
import { createAvailableProjectName } from "@/lib/projectManagement";
import { normalizeProject } from "@/lib/projectSerde";
import {
  createEmptyProjectAssetLibrary,
  extractInlineSamplePlayerAssets,
  normalizeProjectAssetLibrary
} from "@/lib/sampleAssetLibrary";
import { ProjectAssetLibrary } from "@/types/assets";
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

export const createProjectFromDefaultTemplate = (): Project => withUpdatedTimestamp(createDefaultProject());

export const prepareImportedProject = (project: Project): Project => ({
  ...project,
  id: createId("project"),
  updatedAt: Date.now()
});

export const hydrateProjectSnapshot = (
  project: unknown,
  assets: unknown = createEmptyProjectAssetLibrary()
): { project: Project; assets: ProjectAssetLibrary } => {
  const normalizedProject = normalizeProject(project);
  const normalizedAssets = normalizeProjectAssetLibrary(assets);
  return extractInlineSamplePlayerAssets(normalizedProject, normalizedAssets);
};
