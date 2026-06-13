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
  test("shows explicit composition end with the same one-based beat name as the timeline header", async () => {
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
          await openSeededApp(page, createEmptyComposerProject({ compositionEndBeat: 4.75 }));

          await page.locator(".track-canvas-shell > canvas").click({ position: compositionEndPointForBeat(4.75) });

          await expect(page.locator(".timeline-actions-popover")).toBeVisible();
          await expect(page.locator(".number-wheel-end-beat .number-wheel-value")).toHaveText("5.75");
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

  test("keeps an extended explicit composition end after deleting notes beyond the old end", async () => {
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
          await openSeededApp(page, createEmptyComposerProject({ compositionEndBeat: 4 }));
          const canvas = page.locator(".track-canvas-shell > canvas");

          await canvas.dblclick({ position: trackLanePointForBeat(5) });
          await canvas.dblclick({ position: trackLanePointForBeat(6) });
          await expect.poll(() => readFirstTrackNoteCount(page)).toBe(2);
          const extendedEndBeat = (await readActiveProject(page)).global.compositionEnd?.beat;
          expect(extendedEndBeat).toBeGreaterThan(4);

          await canvas.click({ position: trackLanePointForBeat(6.1) });
          await page.keyboard.press("Backspace");
          await expect.poll(() => readFirstTrackNoteCount(page)).toBe(1);

          await canvas.click({ position: trackLanePointForBeat(5.1) });
          await page.keyboard.press("Backspace");
          await expect.poll(() => readFirstTrackNoteCount(page)).toBe(0);

          expect((await readActiveProject(page)).global.compositionEnd?.beat).toBe(extendedEndBeat);
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

  test("separates empty-lane clicks, double-click note creation, and marquee drags", async () => {
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
          await canvas.dblclick({ position: trackLanePointForBeat(6) });
          await expect.poll(() => readFirstTrackNoteCount(page)).toBe(2);

          const notes = await readFirstTrackNotes(page);
          expect(notes[0]).toMatchObject({
            pitchStr: "C4",
            startBeat: 4,
            durationBeats: 0.5
          });
          expect(notes[1]).toMatchObject({
            pitchStr: "C4",
            startBeat: 6,
            durationBeats: 0.5
          });

          await canvas.click({ position: trackLanePointForBeat(4.25) });
          await expect(page.locator(".selection-actions-popover")).toBeVisible();
          await dragOnCanvas(page, trackLanePointForBeat(3.75), {
            x: HEADER_WIDTH + 7 * BEAT_WIDTH,
            y: RULER_HEIGHT + TRACK_HEIGHT * 1.5
          });
          await page.locator(".selection-actions-popover").getByRole("button", { name: "Delete", exact: true }).click();
          await expect.poll(() => readFirstTrackNoteCount(page)).toBe(0);
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

  test("does not open the volume popover after leaving before the hover delay finishes", async () => {
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

          const volumeButton = page.locator('[data-track-chrome="volume-button"]').first();
          await expect(volumeButton).toBeVisible();

          await volumeButton.hover();
          await page.mouse.move(480, 420);
          await page.waitForTimeout(1100);
          await expect(page.locator('[data-track-popover="volume"]')).toHaveCount(0);

          await volumeButton.hover();
          await page.waitForTimeout(1100);
          await expect(page.locator('[data-track-popover="volume"]')).toBeVisible();
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

  test("keeps expanded macro panels visible but muted after selecting another track", async () => {
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

          await page.locator('[data-testid="track-name-button"]').first().click();
          await page.getByRole("button", { name: "Expand macro lanes" }).click();
          await expect(page.locator('[data-track-chrome="macro-panel"]')).toBeVisible();

          await page.locator('[data-testid="track-name-button"]').nth(1).click();

          const macroPanel = page.locator('[data-track-chrome="macro-panel"]').first();
          await expect(macroPanel).toBeVisible();
          await expect(macroPanel.locator("button").first()).toBeDisabled();
          await expect
            .poll(() =>
              macroPanel.evaluate((element) => {
                const panel = element.querySelector('[class*="inspectorPanel"]');
                return panel ? window.getComputedStyle(panel).borderTopColor : null;
              })
            )
            .toBe("rgba(0, 0, 0, 0)");

          await macroPanel.click({ position: { x: 18, y: 18 } });
          await expect(page.locator('[data-testid="track-name-button"]').first()).toHaveCSS("cursor", "text");
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

const createEmptyComposerProject = (options?: { compositionEndBeat?: number }): Project => {
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

const trackLanePointForBeat = (beat: number) => ({
  x: HEADER_WIDTH + beat * BEAT_WIDTH,
  y: RULER_HEIGHT + TRACK_HEIGHT / 2
});

const compositionEndPointForBeat = (beat: number) => ({
  x: HEADER_WIDTH + beat * BEAT_WIDTH,
  y: RULER_HEIGHT + TRACK_HEIGHT + 24
});

const dragOnCanvas = async (page: Page, start: { x: number; y: number }, end: { x: number; y: number }) => {
  const canvas = page.locator(".track-canvas-shell > canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Could not determine track canvas bounds for drag.");
  }
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 8 });
  await page.mouse.up();
};

const readFirstTrackNoteCount = async (page: Page): Promise<number> => (await readFirstTrackNotes(page)).length;

const readFirstTrackNotes = async (page: Page): Promise<Project["tracks"][number]["notes"]> =>
  (await readActiveProject(page)).tracks[0]?.notes ?? [];

const readActiveProject = async (page: Page): Promise<Project> =>
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
