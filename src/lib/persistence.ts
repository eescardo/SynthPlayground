import { openDB } from "idb";
import { Project } from "@/types/music";

const DB_NAME = "synth-playground";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const ACTIVE_PROJECT_KEY = "active";

interface SynthDb {
  projects: {
    key: string;
    value: Project;
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
      }
    });
  }
  return dbPromise;
};

export const saveProject = async (project: Project): Promise<void> => {
  const db = await getDb();
  await db.put(PROJECT_STORE, project, ACTIVE_PROJECT_KEY);
};

export const loadProject = async (): Promise<Project | null> => {
  const db = await getDb();
  return (await db.get(PROJECT_STORE, ACTIVE_PROJECT_KEY)) ?? null;
};

export const clearProject = async (): Promise<void> => {
  const db = await getDb();
  await db.delete(PROJECT_STORE, ACTIVE_PROJECT_KEY);
};
