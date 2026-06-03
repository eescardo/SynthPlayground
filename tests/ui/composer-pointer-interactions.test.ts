import { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chromium, expect, type Page } from "@playwright/test";
import { afterEach, describe, test } from "vitest";
import { BEAT_WIDTH, HEADER_WIDTH, RULER_HEIGHT, TRACK_HEIGHT } from "../../src/components/tracks/trackCanvasConstants";
import { createDefaultProject } from "../../src/lib/patch/presets";
import type { Project } from "../../src/types/music";
import { openSeededApp, startDevServer, waitForServer } from "../../scripts/ui-capture/common";

const PORT = 3602;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const cleanupProcesses = new Set<ChildProcess>();

afterEach(async () => {
  for (const process of cleanupProcesses) {
    if (process.exitCode !== null) {
      continue;
    }
    process.kill("SIGTERM");
    await once(process, "exit");
  }
  cleanupProcesses.clear();
});

describe.sequential("composer pointer interactions", () => {
  test("moves the playhead on single empty-lane click and creates one note on double-click", async () => {
    const devServer = startDevServer(PORT);
    cleanupProcesses.add(devServer);

    await waitForServer(BASE_URL, 120_000);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 1400, height: 900 }
      });

      try {
        const page = await context.newPage();
        try {
          await openSeededApp(page, createEmptyComposerProject());

          const canvas = page.locator(".track-canvas-shell > canvas");
          await canvas.click({ position: trackLanePointForBeat(2) });
          await expect(page.locator(".playhead")).toHaveText("Beat 3");
          await expect.poll(() => readFirstTrackNoteCount(page)).toBe(0);

          await canvas.dblclick({ position: trackLanePointForBeat(4) });
          await expect.poll(() => readFirstTrackNoteCount(page)).toBe(1);

          const notes = await readFirstTrackNotes(page);
          expect(notes[0]).toMatchObject({
            pitchStr: "C4",
            startBeat: 4,
            durationBeats: 0.5
          });
        } finally {
          await page.close();
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }, 120_000);
});

const createEmptyComposerProject = (): Project => {
  const project = createDefaultProject();
  return {
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, notes: [] }))
  };
};

const trackLanePointForBeat = (beat: number) => ({
  x: HEADER_WIDTH + beat * BEAT_WIDTH,
  y: RULER_HEIGHT + TRACK_HEIGHT / 2
});

const readFirstTrackNoteCount = async (page: Page): Promise<number> => (await readFirstTrackNotes(page)).length;

const readFirstTrackNotes = async (page: Page): Promise<Project["tracks"][number]["notes"]> =>
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
            resolve(project?.tracks[0]?.notes ?? []);
          };
          tx.oncomplete = () => db.close();
        };
      })
  );
