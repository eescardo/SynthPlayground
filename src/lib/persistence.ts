import { openDB } from "idb";
import { Project } from "@/types/music";
import { ProjectAssetLibrary } from "@/types/assets";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";

const DB_NAME = "synth-playground";
const DB_VERSION = 2;
const PROJECT_STORE = "projects";
const ACTIVE_PROJECT_KEY = "active";
const ASSET_STORE = "project_assets";
const ACTIVE_PROJECT_ASSETS_KEY = "active_assets";

interface SynthDb {
  projects: {
    key: string;
    value: Project;
  };
  project_assets: {
    key: string;
    value: ProjectAssetLibrary;
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
      }
    });
  }
  return dbPromise;
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

export const clearProjectState = async (): Promise<void> => {
  const db = await getDb();
  await Promise.all([
    db.delete(PROJECT_STORE, ACTIVE_PROJECT_KEY),
    db.delete(ASSET_STORE, ACTIVE_PROJECT_ASSETS_KEY)
  ]);
};
