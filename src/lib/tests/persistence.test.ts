import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectAssetLibrary } from "@/types/assets";
import { Project } from "@/types/music";

const { openDBMock } = vi.hoisted(() => ({
  openDBMock: vi.fn()
}));

vi.mock("idb", () => ({
  openDB: openDBMock
}));

type StoreName = "projects" | "project_assets" | "project_meta";

const createProject = (overrides: Partial<Project> = {}): Project => ({
  id: "project_1",
  name: "Project One",
  global: {
    sampleRate: 48000,
    tempo: 122,
    meter: "4/4",
    gridBeats: 0.25,
    loop: []
  },
  tracks: [],
  patches: [],
  masterFx: {
    compressorEnabled: false,
    limiterEnabled: true,
    makeupGain: 0
  },
  ui: {
    patchWorkspace: {
      tabs: []
    }
  },
  createdAt: 1,
  updatedAt: 1,
  ...overrides
});

const createAssets = (overrides: Partial<ProjectAssetLibrary> = {}): ProjectAssetLibrary => ({
  samplePlayerById: {
    sampleAsset_1: "serialized sample data",
    ...overrides.samplePlayerById
  }
});

const createMockDb = () => {
  const stores: Record<StoreName, Map<string, unknown>> = {
    projects: new Map(),
    project_assets: new Map(),
    project_meta: new Map()
  };

  return {
    stores,
    put: vi.fn(async (store: StoreName, value: unknown, key: string) => {
      stores[store].set(key, value);
      return key;
    }),
    get: vi.fn(async (store: StoreName, key: string) => stores[store].get(key)),
    delete: vi.fn(async (store: StoreName, key: string) => {
      stores[store].delete(key);
    })
  };
};

describe("persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    openDBMock.mockReset();
  });

  it("saves the active project without rewriting active assets", async () => {
    const db = createMockDb();
    openDBMock.mockResolvedValue(db);
    const { saveActiveProject } = await import("@/lib/persistence");
    const project = createProject();

    await saveActiveProject(project);

    expect(db.put).toHaveBeenCalledOnce();
    expect(db.put).toHaveBeenCalledWith("projects", project, "active");
    expect(db.stores.projects.get("active")).toBe(project);
    expect(db.stores.project_assets.has("active_assets")).toBe(false);
  });

  it("saves active assets without rewriting the active project", async () => {
    const db = createMockDb();
    openDBMock.mockResolvedValue(db);
    const { saveActiveProjectAssets } = await import("@/lib/persistence");
    const assets = createAssets();

    await saveActiveProjectAssets(assets);

    expect(db.put).toHaveBeenCalledOnce();
    expect(db.put).toHaveBeenCalledWith("project_assets", assets, "active_assets");
    expect(db.stores.project_assets.get("active_assets")).toBe(assets);
    expect(db.stores.projects.has("active")).toBe(false);
  });

  it("keeps the combined active save and load behavior", async () => {
    const db = createMockDb();
    openDBMock.mockResolvedValue(db);
    const { loadProjectState, saveProjectState } = await import("@/lib/persistence");
    const project = createProject();
    const assets = createAssets();

    await saveProjectState(project, assets);

    expect(db.put).toHaveBeenCalledWith("projects", project, "active");
    expect(db.put).toHaveBeenCalledWith("project_assets", assets, "active_assets");
    await expect(loadProjectState()).resolves.toEqual({ project, assets });
  });
});
