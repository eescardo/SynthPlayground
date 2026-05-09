import { openDB } from "idb";

const DB_NAME = "synth-playground-sprout";
const DB_VERSION = 1;
const CHAT_STORE = "project_chats";

export type SproutChatRole = "user" | "assistant";

export interface SproutChatMessage {
  id: string;
  role: SproutChatRole;
  content: string;
  createdAt: string;
}

interface SproutChatDb {
  project_chats: {
    key: string;
    value: SproutChatMessage[];
  };
}

let dbPromise: ReturnType<typeof openDB<SproutChatDb>> | null = null;

export const createSproutChatStorageKey = (projectId: string) => `project:${projectId}:current`;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<SproutChatDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CHAT_STORE)) {
          db.createObjectStore(CHAT_STORE);
        }
      }
    });
  }
  return dbPromise;
};

export const loadSproutChatMessages = async (projectId: string): Promise<SproutChatMessage[]> => {
  const db = await getDb();
  return (await db.get(CHAT_STORE, createSproutChatStorageKey(projectId))) ?? [];
};

export const saveSproutChatMessages = async (projectId: string, messages: SproutChatMessage[]): Promise<void> => {
  const db = await getDb();
  await db.put(CHAT_STORE, messages, createSproutChatStorageKey(projectId));
};
