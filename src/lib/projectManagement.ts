import { Project } from "@/types/music";

export interface RecentProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export const RECENT_PROJECT_LIMIT = 4;
export const DEFAULT_NEW_PROJECT_NAME = "New Project";

export const renameProjectInProject = (project: Project, name: string): Project => {
  const trimmed = name.trim();
  if (!trimmed || trimmed === project.name) {
    return project;
  }

  return {
    ...project,
    name: trimmed
  };
};

export const upsertRecentProjectSummary = (
  summaries: RecentProjectSummary[],
  project: Pick<Project, "id" | "name" | "updatedAt">
): RecentProjectSummary[] => {
  const nextEntry: RecentProjectSummary = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt
  };

  return [nextEntry, ...summaries.filter((entry) => entry.id !== project.id)].slice(0, RECENT_PROJECT_LIMIT);
};

export const removeRecentProjectSummary = (
  summaries: RecentProjectSummary[],
  projectId: string
): RecentProjectSummary[] => {
  return summaries.filter((entry) => entry.id !== projectId);
};

export const createAvailableProjectName = (reservedNames: string[], baseName = DEFAULT_NEW_PROJECT_NAME): string => {
  const normalizedReservedNames = new Set(
    reservedNames.map((name) => name.trim().toLocaleLowerCase()).filter((name) => name.length > 0)
  );

  if (!normalizedReservedNames.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (normalizedReservedNames.has(`${baseName} ${suffix}`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
};
