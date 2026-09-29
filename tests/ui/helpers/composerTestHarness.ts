import { type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { createDefaultProject } from "../../../src/lib/patch/presets";
import type { Project } from "../../../src/types/music";
import { openSeededApp, startDevServer, waitForServer } from "../../../scripts/ui-capture/common";

export const createComposerTestHarness = (port: number) => {
  const baseUrl = `http://127.0.0.1:${port}`;
  const cleanupProcesses = new Set<ChildProcess>();

  const cleanup = async () => {
    for (const process of cleanupProcesses) {
      if (process.exitCode !== null) {
        continue;
      }
      process.kill("SIGTERM");
      await once(process, "exit");
    }
    cleanupProcesses.clear();
  };

  const withSeededComposerPage = async (
    project: Project,
    run: (page: Page) => Promise<void>,
    options?: { env?: Record<string, string>; viewport?: { width: number; height: number } }
  ) => {
    const devServer = startDevServer(port, options?.env);
    cleanupProcesses.add(devServer);
    await waitForServer(baseUrl, 120_000);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        baseURL: baseUrl,
        viewport: options?.viewport ?? { width: 1400, height: 620 }
      });
      try {
        const page = await context.newPage();
        try {
          await openSeededApp(page, project);
          await run(page);
        } finally {
          await page.close();
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  };

  return { cleanup, withSeededComposerPage };
};

export const createEmptyComposerProject = (options?: { compositionEndBeat?: number }): Project => {
  const project = createDefaultProject();
  return {
    ...project,
    global: {
      ...project.global,
      compositionEnd: options?.compositionEndBeat === undefined ? undefined : { beat: options.compositionEndBeat }
    },
    tracks: project.tracks.map((track) => ({ ...track, notes: [] }))
  };
};

export const createManyTrackComposerProject = (trackCount: number): Project => {
  const project = createEmptyComposerProject();
  const sourceTracks = project.tracks;
  return {
    ...project,
    tracks: Array.from({ length: trackCount }, (_, index) => {
      const source = sourceTracks[index % sourceTracks.length];
      return {
        ...structuredClone(source),
        id: `scroll-track-${index + 1}`,
        name: `Scroll Track ${index + 1}`
      };
    })
  };
};

export const readActiveProject = async (page: Page): Promise<Project> =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = window.indexedDB.open("synth-playground", 3);
        request.onerror = () => reject(request.error ?? new Error("Failed to open synth-playground database."));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("projects", "readonly");
          const getRequest = tx.objectStore("projects").get("active");
          getRequest.onerror = () =>
            reject(getRequest.error ?? new Error("Failed to read active project from IndexedDB."));
          getRequest.onsuccess = () => {
            const project = getRequest.result as Project | undefined;
            if (!project) {
              reject(new Error("No active project was found in IndexedDB."));
              return;
            }
            resolve(project);
          };
          tx.oncomplete = () => db.close();
        };
      })
  );

export const readFirstTrackNotes = async (page: Page): Promise<Project["tracks"][number]["notes"]> =>
  (await readActiveProject(page)).tracks[0]?.notes ?? [];

export const readFirstTrackNoteCount = async (page: Page): Promise<number> => (await readFirstTrackNotes(page)).length;

export const readTotalNoteCount = async (page: Page): Promise<number> =>
  (await readActiveProject(page)).tracks.reduce((count, track) => count + track.notes.length, 0);

export const readTrackIds = async (page: Page): Promise<string[]> =>
  (await readActiveProject(page)).tracks.map((track) => track.id);

export const waitForScrollStability = async (shell: Locator) => {
  await expect
    .poll(() =>
      shell.evaluate(
        (element) =>
          new Promise<boolean>((resolve) => {
            const scrollTop = element.scrollTop;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve(element.scrollTop === scrollTop));
            });
          })
      )
    )
    .toBe(true);
};

export const readScrollTopAcrossFrames = (shell: Locator, frameCount: number): Promise<number[]> =>
  shell.evaluate(
    (element, count) =>
      new Promise<number[]>((resolve) => {
        const values: number[] = [];
        const readFrame = () => {
          values.push(element.scrollTop);
          if (values.length === count) {
            resolve(values);
            return;
          }
          requestAnimationFrame(readFrame);
        };
        requestAnimationFrame(readFrame);
      }),
    frameCount
  );
