import { openDB } from "idb";
import { RecentProjectSummary, removeRecentProjectSummary, upsertRecentProjectSummary } from "@/lib/projectManagement";
import { Project } from "@/types/music";
import { ProjectAssetLibrary } from "@/types/assets";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";

const DB_NAME = "synth-playground";
const DB_VERSION = 3;
const PROJECT_STORE = "projects";
const ACTIVE_PROJECT_KEY = "active";
const ASSET_STORE = "project_assets";
const ACTIVE_PROJECT_ASSETS_KEY = "active_assets";
const PROJECT_META_STORE = "project_meta";
const RECENT_PROJECT_META_KEY = "recent_projects";

const recentProjectKey = (projectId: string) => `recent:${projectId}`;

export interface RecentProjectSnapshot {
  project: Project;
  assets: ProjectAssetLibrary;
}

interface SynthDb {
  projects: {
    key: string;
    value: Project;
  };
  project_assets: {
    key: string;
    value: ProjectAssetLibrary;
  };
  project_meta: {
    key: string;
    value: RecentProjectSummary[];
  };
}

let dbPromise: ReturnType<typeof openDB<SynthDb>> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<SynthDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE);
        }
        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE);
        }
        if (!db.objectStoreNames.contains(PROJECT_META_STORE)) {
          db.createObjectStore(PROJECT_META_STORE);
        }
      }
    });
  }
  return dbPromise;
};

const loadRecentProjectSummaries = async (db: Awaited<ReturnType<typeof getDb>>): Promise<RecentProjectSummary[]> => {
  return (await db.get(PROJECT_META_STORE, RECENT_PROJECT_META_KEY)) ?? [];
};

export const saveProjectState = async (project: Project, assets: ProjectAssetLibrary): Promise<void> => {
  const db = await getDb();
  await Promise.all([
    db.put(PROJECT_STORE, project, ACTIVE_PROJECT_KEY),
    db.put(ASSET_STORE, assets, ACTIVE_PROJECT_ASSETS_KEY)
  ]);
};

export const loadProjectState = async (): Promise<{ project: Project; assets: ProjectAssetLibrary } | null> => {
  const db = await getDb();
  const project = (await db.get(PROJECT_STORE, ACTIVE_PROJECT_KEY)) ?? null;
  if (!project) {
    return null;
  }
  const assets = (await db.get(ASSET_STORE, ACTIVE_PROJECT_ASSETS_KEY)) ?? createEmptyProjectAssetLibrary();
  return { project, assets };
};

export const loadRecentProjectSnapshots = async (): Promise<RecentProjectSnapshot[]> => {
  const db = await getDb();
  const summaries = await loadRecentProjectSummaries(db);
  const snapshots = await Promise.all(
    summaries.map(async (summary) => {
      const [project, assets] = await Promise.all([
        db.get(PROJECT_STORE, recentProjectKey(summary.id)),
        db.get(ASSET_STORE, recentProjectKey(summary.id))
      ]);

      if (!project) {
        return null;
      }

      return {
        project,
        assets: assets ?? createEmptyProjectAssetLibrary()
      };
    })
  );

  const validSnapshots = snapshots.filter((snapshot): snapshot is RecentProjectSnapshot => snapshot !== null);
  if (validSnapshots.length !== summaries.length) {
    await db.put(
      PROJECT_META_STORE,
      validSnapshots.map(({ project }) => ({ id: project.id, name: project.name, updatedAt: project.updatedAt })),
      RECENT_PROJECT_META_KEY
    );
  }

  return validSnapshots;
};

export const saveRecentProjectSnapshot = async (project: Project, assets: ProjectAssetLibrary): Promise<void> => {
  const db = await getDb();
  const currentSummaries = await loadRecentProjectSummaries(db);
  const nextSummaries = upsertRecentProjectSummary(currentSummaries, project);
  const removedSummaries = currentSummaries.filter(
    (entry) => !nextSummaries.some((nextEntry) => nextEntry.id === entry.id)
  );

  await Promise.all([
    db.put(PROJECT_STORE, project, recentProjectKey(project.id)),
    db.put(ASSET_STORE, assets, recentProjectKey(project.id)),
    db.put(PROJECT_META_STORE, nextSummaries, RECENT_PROJECT_META_KEY),
    ...removedSummaries.flatMap((entry) => [
      db.delete(PROJECT_STORE, recentProjectKey(entry.id)),
      db.delete(ASSET_STORE, recentProjectKey(entry.id))
    ])
  ]);
};

export const removeRecentProjectSnapshot = async (projectId: string): Promise<void> => {
  const db = await getDb();
  const currentSummaries = await loadRecentProjectSummaries(db);
  const nextSummaries = removeRecentProjectSummary(currentSummaries, projectId);

  await Promise.all([
    db.put(PROJECT_META_STORE, nextSummaries, RECENT_PROJECT_META_KEY),
    db.delete(PROJECT_STORE, recentProjectKey(projectId)),
    db.delete(ASSET_STORE, recentProjectKey(projectId))
  ]);
};
