import { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
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

  test.each([0, 100])(
    "separates canvas gestures (%ims double-click spacing)",
    async (clickSpacing) => {
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

            for (const [index, beat] of [4, 6].entries()) {
              await canvas.dblclick({ position: trackLanePointForBeat(beat), delay: clickSpacing });
              await expect.poll(() => readFirstTrackNoteCount(page)).toBe(index + 1);
              // The first click moves the playhead; the second can open its timeline popover.
              // Dismiss it before the next gesture instead of racing its position over the canvas.
              await page.keyboard.press("Escape");
              await expect(page.getByRole("dialog", { name: "Timeline actions" })).toHaveCount(0);
            }

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
            await page
              .locator(".selection-actions-popover")
              .getByRole("button", { name: "Delete", exact: true })
              .click();
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
    },
    120_000
  );

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

  test("keeps composer chrome and the beat ruler fixed while tracks scroll", async () => {
    await withSeededComposerPage(createManyTrackComposerProject(10), async (page) => {
      const shell = page.locator(".track-canvas-shell");
      const transport = page.locator(".transport");
      const stickyRuler = shell.locator('[class*="stickyRuler"] canvas');
      const mainCanvas = shell.locator(":scope > canvas");
      const transportTop = (await transport.boundingBox())?.y;
      const shellTop = (await shell.boundingBox())?.y;

      await shell.evaluate((element) => {
        element.scrollTop = 240;
      });

      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(240);
      expect((await transport.boundingBox())?.y).toBe(transportTop);
      expect((await stickyRuler.boundingBox())?.y).toBe((shellTop ?? 0) + 1);
      expect((await mainCanvas.boundingBox())?.y).toBeLessThan(shellTop ?? 0);

      await shell.click({ position: { x: HEADER_WIDTH + 2 * BEAT_WIDTH, y: RULER_HEIGHT / 2 } });
      await expect(page.locator(".playhead")).toHaveText("Beat 3");
    });
  }, 120_000);

  test("anchors the reorder handle to the left edge and middle 60% as track height changes", async () => {
    await withSeededComposerPage(createEmptyComposerProject(), async (page) => {
      const firstTrackRow = page.getByTestId("track-header-row").first();
      const firstTrackHandle = page.getByTestId("track-reorder-handle").first();

      // The grip escapes the shell; the chrome itself still touches its original border.
      const shell = page.locator(".track-canvas-shell");
      await expect(shell).toHaveCSS("padding-left", "0px");
      await expect(shell).toHaveCSS("margin-left", "0px");
      await expect
        .poll(async () => {
          const shellBox = await shell.boundingBox();
          const rowBox = await firstTrackRow.boundingBox();
          return shellBox && rowBox ? Math.round(rowBox.x - shellBox.x) : null;
        })
        .toBe(1);

      await expectTrackReorderHandleGeometry(firstTrackRow, firstTrackHandle);
      await page.mouse.move(600, 80);
      await expect(firstTrackHandle).toHaveCSS("opacity", "0");
      await page.getByTestId("track-name-button").first().hover();
      await expect(firstTrackHandle).toHaveCSS("opacity", "1");
      await expect(page.getByTestId("track-reorder-handle").nth(1)).toHaveCSS("opacity", "1");
      const chromeEdgeColor = await shell.evaluate((element) => getComputedStyle(element).borderLeftColor);
      await expect
        .poll(() => firstTrackHandle.evaluate((element) => getComputedStyle(element, "::before").backgroundColor))
        .toBe(chromeEdgeColor);
      const readGripAppearance = () =>
        firstTrackHandle.evaluate((element) => ({
          railWidth: parseFloat(getComputedStyle(element, "::before").width),
          dotsOpacity: getComputedStyle(element, "::after").opacity
        }));
      await expect.poll(readGripAppearance).toEqual({ railWidth: 2, dotsOpacity: "0" });
      const restingBox = await firstTrackHandle.boundingBox();
      // Hover the invisible outer portion, well away from the resting 2px line.
      await firstTrackHandle.hover({ position: { x: 2, y: 12 } });
      await expect.poll(async () => (await readGripAppearance()).railWidth).toBeGreaterThan(11);
      await expect.poll(async () => (await readGripAppearance()).dotsOpacity).toBe("1");
      expect(await firstTrackHandle.boundingBox()).toEqual(restingBox);
      await expectTrackReorderHandleGeometry(firstTrackRow, firstTrackHandle);
      // The invisible inner portion must also reveal the centered grip.
      await firstTrackHandle.hover({ position: { x: 9, y: 12 } });
      await expect.poll(async () => (await readGripAppearance()).dotsOpacity).toBe("1");
      await page.mouse.move(600, 80);
      await expect.poll(readGripAppearance).toEqual({ railWidth: 2, dotsOpacity: "0" });
      await expect(firstTrackHandle).toHaveCSS("opacity", "0");
      await expect(page.getByTestId("track-reorder-handle").nth(1)).toHaveCSS("opacity", "0");
      const collapsedHeight = (await firstTrackRow.boundingBox())?.height ?? 0;

      await page.getByTestId("track-name-button").first().click();
      await page.getByRole("button", { name: "Expand macro lanes" }).click();
      const macroPanel = page.locator('[data-track-chrome="macro-panel"]');
      await expect(macroPanel).toBeVisible();
      await expect.poll(async () => (await firstTrackRow.boundingBox())?.height ?? 0).toBeGreaterThan(collapsedHeight);
      await expectTrackReorderHandleGeometry(firstTrackRow, firstTrackHandle);
      await expect
        .poll(async () => {
          const handleBox = await firstTrackHandle.boundingBox();
          const panelBox = await macroPanel.boundingBox();
          return handleBox && panelBox ? handleBox.x + handleBox.width <= panelBox.x : false;
        })
        .toBe(true);

      await page.getByRole("button", { name: "Collapse macro lanes" }).click();
      await expect.poll(async () => (await firstTrackRow.boundingBox())?.height ?? 0).toBe(collapsedHeight);
      await expectTrackReorderHandleGeometry(firstTrackRow, firstTrackHandle);
    });
  }, 120_000);

  test("persists a scrolled drag-and-drop reorder and restores it with Undo", async () => {
    const seededProject = createManyTrackComposerProject(10);
    await withSeededComposerPage(seededProject, async (page) => {
      const shell = page.locator(".track-canvas-shell");
      await shell.evaluate((element) => {
        element.scrollTop = 300;
      });
      const reorderHandles = page.getByTestId("track-reorder-handle");
      const trackPatchSelectors = page.locator('[data-track-control="instrument-selection"]');
      // Start in the half of the grip that extends outside the scrolling shell.
      await reorderHandles.nth(8).dragTo(trackPatchSelectors.nth(9), { sourcePosition: { x: 2, y: 12 } });

      const movedTrackIds = reorderedLastTrackIds(seededProject);
      await expect.poll(() => readTrackIds(page)).toEqual(movedTrackIds);
      expect(await page.getByTestId("track-name-button").allTextContents()).toEqual([
        ...seededProject.tracks.slice(0, 8).map((track) => track.name),
        seededProject.tracks[9].name,
        seededProject.tracks[8].name
      ]);

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Control+z");
      await expect.poll(() => readTrackIds(page)).toEqual(seededProject.tracks.map((track) => track.id));
      expect(await page.getByTestId("track-name-button").allTextContents()).toEqual(
        seededProject.tracks.map((track) => track.name)
      );
    });
  }, 120_000);

  test("commits a drop above the first track onto the toolbar", async () => {
    const project = createManyTrackComposerProject(10);
    await withSeededComposerPage(project, async (page) => {
      await page
        .getByTestId("track-reorder-handle")
        .nth(3)
        .dragTo(page.getByRole("button", { name: "Add Track", exact: true }));
      await expect
        .poll(() => readTrackIds(page))
        .toEqual([project.tracks[3].id, ...project.tracks.filter((_, index) => index !== 3).map((track) => track.id)]);
      await expect(page.getByTestId("track-name-button").first()).toHaveText(project.tracks[3].name);
    });
  }, 120_000);

  test.each(["above", "below"] as const)(
    "clamps a drop %s the shell while scrolled",
    async (side) => {
      const project = createManyTrackComposerProject(20);
      await withSeededComposerPage(project, async (page) => {
        const shell = page.locator(".track-canvas-shell");
        await shell.evaluate((element) => {
          element.scrollTop = 300;
        });
        const handle = page.getByTestId("track-reorder-handle").nth(7);
        await expect(handle).toBeInViewport();
        const grip = (await handle.boundingBox())!;
        const bounds = (await shell.boundingBox())!;
        const dropY = side === "above" ? bounds.y - 30 : bounds.y + bounds.height + 4;
        expect(dropY).toBeLessThan(page.viewportSize()!.height);
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(bounds.x + 50, dropY, { steps: 3 });
        // Release before edge auto-scroll reaches either end: page-wide clamping must stand alone.
        const scroll = await shell.evaluate((element) => ({
          top: element.scrollTop,
          max: element.scrollHeight - element.clientHeight
        }));
        expect(scroll.top).toBeGreaterThan(0);
        expect(scroll.top).toBeLessThan(scroll.max);
        await page.mouse.up();
        const rest = project.tracks.filter((_, index) => index !== 7).map((track) => track.id);
        await expect
          .poll(() => readTrackIds(page))
          .toEqual(side === "above" ? [project.tracks[7].id, ...rest] : [...rest, project.tracks[7].id]);
        const names = page.getByTestId("track-name-button");
        await expect(side === "above" ? names.first() : names.last()).toHaveText(project.tracks[7].name);
      });
    },
    120_000
  );

  test.each(["volume", "pan"] as const)(
    "closes the %s popover when the track shell scrolls",
    async (kind) => {
      await withSeededComposerPage(createManyTrackComposerProject(20), async (page) => {
        const button = page.locator(`[data-track-chrome="${kind}-button"]`).first();
        await button.click();
        const popover = page.locator(`[data-track-popover="${kind}"]`);
        await expect(popover).toBeVisible();
        await page.locator(".track-canvas-shell").evaluate((element) => {
          element.scrollTop = 150;
        });
        await expect(popover).toHaveCount(0);
      });
    },
    120_000
  );

  test("cancels a pending volume hover-open when the track shell scrolls", async () => {
    await withSeededComposerPage(createManyTrackComposerProject(20), async (page) => {
      const button = page.locator('[data-track-chrome="volume-button"]').first();
      await button.hover();
      await page.locator(".track-canvas-shell").evaluate((element) => {
        element.scrollTop = 1;
      });
      // Keep the control hovered so only cancelling the pending timer prevents reopening.
      expect(await button.evaluate((element) => element.matches(":hover"))).toBe(true);
      await page.waitForTimeout(1100);
      await expect(page.locator('[data-track-popover="volume"]')).toHaveCount(0);
    });
  }, 120_000);

  test("auto-scrolls in both directions during a held drag and stops after drop", async () => {
    const project = createManyTrackComposerProject(20);
    await withSeededComposerPage(project, async (page) => {
      const shell = page.locator(".track-canvas-shell");
      const bounds = (await shell.boundingBox())!;
      const handle = page.getByTestId("track-reorder-handle").first();
      const grip = (await handle.boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 50, bounds.y + bounds.height - 8, { steps: 12 });
      // No further pointer movement: the animation loop must keep scrolling.
      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeGreaterThan(700);
      await page.mouse.move(bounds.x + 50, bounds.y + RULER_HEIGHT + 4, { steps: 6 });
      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeLessThan(100);
      await page.mouse.move(bounds.x + 50, bounds.y + bounds.height - 8, { steps: 6 });
      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeGreaterThan(800);
      await page.mouse.up();
      await expect.poll(async () => (await readTrackIds(page)).indexOf(project.tracks[0].id)).toBeGreaterThan(10);
      const stoppedAt = await shell.evaluate((element) => element.scrollTop);
      await page.waitForTimeout(150);
      expect(await shell.evaluate((element) => element.scrollTop)).toBe(stoppedAt);
      const committedOrder = await readTrackIds(page);
      await shell.evaluate((element) => {
        element.scrollTop = 0;
      });
      const nextHandle = page.locator(`[data-testid="track-reorder-handle"][data-track-id="${committedOrder[0]}"]`);
      await expect(nextHandle).toBeInViewport();
      const nextGrip = (await nextHandle.boundingBox())!;
      await page.mouse.move(nextGrip.x + nextGrip.width / 2, nextGrip.y + nextGrip.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 50, bounds.y + bounds.height - 8, { steps: 12 });
      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      // Chromium can keep native edge scrolling active while the pointer remains at the edge after cancelling a drag.
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(page.locator('[data-testid="track-reorder-handle"][data-dragging="true"]')).toHaveCount(0);
      await waitForScrollStability(shell);
      const cancellationProbeTop = await shell.evaluate((element) => {
        // Disable Chromium's native drag-edge scrolling so this probe isolates the app's cancelled animation loop.
        element.style.overflow = "hidden";
        const nextScrollTop = Math.min(500, element.scrollHeight - element.clientHeight - 200);
        element.scrollTop = nextScrollTop;
        return nextScrollTop;
      });
      try {
        await waitForScrollStability(shell);
        expect(await shell.evaluate((element) => element.scrollTop)).toBe(cancellationProbeTop);
        expect(
          await shell.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
        ).toBeGreaterThan(100);
        const cancelledAt = await shell.evaluate((element) => element.scrollTop);
        await page.waitForTimeout(150);
        expect(await shell.evaluate((element) => element.scrollTop)).toBe(cancelledAt);
      } finally {
        await shell.evaluate((element) => {
          element.style.overflow = "";
        });
      }
      expect(await readTrackIds(page)).toEqual(committedOrder);
    });
  }, 120_000);

  test("supports keyboard reordering with focus retention and live position announcements", async () => {
    const seededProject = createManyTrackComposerProject(10);
    await withSeededComposerPage(seededProject, async (page) => {
      const lastTrackHandle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-10"]');
      const reorderStatus = page.getByRole("status");
      await expect(lastTrackHandle).toHaveAccessibleName(
        "Reorder Scroll Track 10, position 10 of 10. Use Arrow Up or Arrow Down to move."
      );

      await lastTrackHandle.focus();
      await expect(lastTrackHandle).toHaveCSS("opacity", "1");
      await page.keyboard.press("ArrowUp");
      await expect.poll(() => readTrackIds(page)).toEqual(reorderedLastTrackIds(seededProject));
      await expect(lastTrackHandle).toBeFocused();
      await expect(lastTrackHandle).toHaveAccessibleName(
        "Reorder Scroll Track 10, position 9 of 10. Use Arrow Up or Arrow Down to move."
      );
      await expect(reorderStatus).toHaveText("Moved Scroll Track 10 to position 9 of 10.");

      await page.keyboard.press("Control+z");
      await expect.poll(() => readTrackIds(page)).toEqual(seededProject.tracks.map((track) => track.id));
      await expect(lastTrackHandle).toBeFocused();

      await reorderStatus.evaluate((element) => {
        const observedWindow = window as typeof window & { trackReorderAnnouncementMutations?: string[] };
        observedWindow.trackReorderAnnouncementMutations = [];
        new MutationObserver(() => {
          observedWindow.trackReorderAnnouncementMutations?.push(element.textContent ?? "");
        }).observe(element, { childList: true, characterData: true, subtree: true });
      });

      await page.keyboard.press("ArrowUp");
      await expect.poll(() => readTrackIds(page)).toEqual(reorderedLastTrackIds(seededProject));
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as typeof window & { trackReorderAnnouncementMutations?: string[] })
                .trackReorderAnnouncementMutations
          )
        )
        .toEqual(["", "Moved Scroll Track 10 to position 9 of 10."]);
      await expect(lastTrackHandle).toBeFocused();

      await page.keyboard.press("ArrowDown");
      await expect.poll(() => readTrackIds(page)).toEqual(seededProject.tracks.map((track) => track.id));
      await expect(lastTrackHandle).toBeFocused();
      await expect(reorderStatus).toHaveText("Moved Scroll Track 10 to position 10 of 10.");
    });
  }, 120_000);
});

const withSeededComposerPage = async (project: Project, run: (page: Page) => Promise<void>) => {
  const devServer = startDevServer(PORT);
  cleanupProcesses.add(devServer);
  await waitForServer(BASE_URL, 120_000);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1400, height: 620 }
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

const reorderedLastTrackIds = (project: Project) => [
  ...project.tracks.slice(0, -2).map((track) => track.id),
  project.tracks.at(-1)!.id,
  project.tracks.at(-2)!.id
];

const readTrackIds = async (page: Page) => (await readActiveProject(page)).tracks.map((track) => track.id);

const waitForScrollStability = async (shell: Locator) => {
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

const expectTrackReorderHandleGeometry = async (trackRow: Locator, handle: Locator) => {
  await expect
    .poll(async () => {
      const rowBox = await trackRow.boundingBox();
      const handleBox = await handle.boundingBox();
      if (!rowBox || !handleBox) {
        return null;
      }
      const topPercent = ((handleBox.y - rowBox.y) / rowBox.height) * 100;
      const bottomPercent = ((handleBox.y + handleBox.height - rowBox.y) / rowBox.height) * 100;
      const [rowBackground, handleBackground] = await Promise.all([
        trackRow.evaluate((element) => window.getComputedStyle(element).background),
        handle.evaluate((element) => window.getComputedStyle(element, "::before").background)
      ]);
      const leftEdgeInteractive = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return document.elementFromPoint(rect.left + 1, rect.top + rect.height / 2) === element;
      });
      return {
        edgeCentered: Math.abs(handleBox.x + handleBox.width / 2 - rowBox.x) <= 0.5,
        topAnchored: Math.abs(topPercent - 20) <= 1.5,
        bottomAnchored: Math.abs(bottomPercent - 80) <= 1.5,
        backgroundDistinct: handleBackground !== rowBackground,
        leftEdgeInteractive
      };
    })
    .toEqual({
      edgeCentered: true,
      topAnchored: true,
      bottomAnchored: true,
      backgroundDistinct: true,
      leftEdgeInteractive: true
    });
};

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

const createManyTrackComposerProject = (trackCount: number): Project => {
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
