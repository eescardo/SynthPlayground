import { expect, type Locator, type Page } from "@playwright/test";
import { afterEach, describe, test } from "vitest";
import { BEAT_WIDTH, HEADER_WIDTH, RULER_HEIGHT } from "../../src/components/tracks/trackCanvasConstants";
import type { Project } from "../../src/types/music";
import {
  createComposerTestHarness,
  createEmptyComposerProject,
  createManyTrackComposerProject,
  readFirstTrackNoteCount,
  readTrackIds,
  readScrollTopAcrossFrames,
  waitForScrollStability
} from "./helpers/composerTestHarness";

const { cleanup, withSeededComposerPage } = createComposerTestHarness(3603);

afterEach(cleanup);

describe.sequential("track reorder interactions", () => {
  test("tabs through each reorder handle alongside its own track chrome, including after a reorder", async () => {
    const project = createManyTrackComposerProject(4);
    project.tracks.forEach((track) => {
      track.macroPanelExpanded = false;
    });
    await withSeededComposerPage(project, async (page) => {
      const firstHandle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]');
      const secondHandle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-2"]');
      const names = page.getByTestId("track-name-button");
      const patches = page.locator('[data-track-control="instrument-selection"]');

      await firstHandle.focus();
      await page.keyboard.press("Tab");
      await expect(names.nth(0)).toBeFocused();
      await patches.nth(0).focus();
      await page.keyboard.press("Tab");
      await expect(secondHandle).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(patches.nth(0)).toBeFocused();
      await secondHandle.focus();
      await page.keyboard.press("Tab");
      await expect(names.nth(1)).toBeFocused();

      await secondHandle.focus();
      await page.keyboard.press("ArrowUp");
      await expect
        .poll(() => readTrackIds(page))
        .toEqual([project.tracks[1].id, project.tracks[0].id, ...project.tracks.slice(2).map((track) => track.id)]);
      await expect(secondHandle).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(names.nth(0)).toBeFocused();
      await patches.nth(0).focus();
      await page.keyboard.press("Tab");
      await expect(firstHandle).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(patches.nth(0)).toBeFocused();
    });
  }, 120_000);

  test("keeps composer chrome and the beat ruler fixed while tracks scroll", async () => {
    await withSeededComposerPage(createManyTrackComposerProject(10), async (page) => {
      const shell = page.locator(".track-canvas-shell");
      const transport = page.locator(".transport");
      const stickyRuler = shell.locator('[class*="stickyRuler"] canvas');
      const rulerCornerMask = page.getByTestId("track-ruler-corner-mask");
      const mainCanvas = shell.locator(":scope > canvas");
      const transportTop = (await transport.boundingBox())?.y;
      const shellTop = (await shell.boundingBox())?.y;

      await shell.evaluate((element, scrollLeft) => {
        element.scrollTop = 240;
        element.scrollLeft = scrollLeft;
      }, 4 * BEAT_WIDTH);

      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(240);
      await expect.poll(() => shell.evaluate((element) => element.scrollLeft)).toBe(4 * BEAT_WIDTH);
      expect((await transport.boundingBox())?.y).toBe(transportTop);
      expect((await stickyRuler.boundingBox())?.y).toBe((shellTop ?? 0) + 1);
      expect((await mainCanvas.boundingBox())?.y).toBeLessThan(shellTop ?? 0);
      await expect
        .poll(async () => {
          const shellBox = await shell.boundingBox();
          const maskBox = await rulerCornerMask.boundingBox();
          if (!shellBox || !maskBox) return null;
          return {
            leftAligned: Math.abs(maskBox.x - shellBox.x - 1) <= 0.5,
            width: maskBox.width,
            cornerTarget: await page.evaluate(
              ({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset.testid,
              { x: shellBox.x + 10, y: shellBox.y + 10 }
            ),
            rulerTarget: await page.evaluate(
              ({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.tagName,
              { x: shellBox.x + HEADER_WIDTH + 10, y: shellBox.y + 10 }
            )
          };
        })
        .toEqual({
          leftAligned: true,
          width: HEADER_WIDTH,
          cornerTarget: "track-ruler-corner-mask",
          rulerTarget: "CANVAS"
        });

      await shell.click({ position: { x: HEADER_WIDTH + 2 * BEAT_WIDTH, y: RULER_HEIGHT / 2 } });
      await expect(page.locator(".playhead")).toHaveText("Beat 7");
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
      await expect(page.locator('[data-track-chrome="header-overlays"]')).toHaveAttribute(
        "data-reorder-group-active",
        "true"
      );
      await expect(firstTrackHandle).toHaveAttribute("data-group-active", "true");
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
      const secondTrackHandle = page.getByTestId("track-reorder-handle").nth(1);
      await expect(secondTrackHandle).toHaveCSS("opacity", "1");
      await expect
        .poll(() => secondTrackHandle.evaluate((element) => getComputedStyle(element, "::after").opacity))
        .toBe("0");
      await expect.poll(async () => (await readGripAppearance()).railWidth).toBeGreaterThan(11);
      await expect.poll(async () => (await readGripAppearance()).dotsOpacity).toBe("1");
      expect(await firstTrackHandle.boundingBox()).toEqual(restingBox);
      await expectTrackReorderHandleGeometry(firstTrackRow, firstTrackHandle);
      // The invisible inner portion must also reveal the centered grip.
      await firstTrackHandle.hover({ position: { x: 9, y: 12 } });
      await expect.poll(async () => (await readGripAppearance()).dotsOpacity).toBe("1");
      await page.mouse.move(600, 80);
      await expect(page.locator('[data-track-chrome="header-overlays"]')).toHaveAttribute(
        "data-reorder-group-active",
        "false"
      );
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
      await page.setViewportSize({ width: 1100, height: 500 });
      await expectTrackReorderHandleGeometry(firstTrackRow, firstTrackHandle);
    });
  }, 120_000);

  test("routes vertical, horizontal, and zoom wheels from the outside-edge grip to the track shell", async () => {
    await withSeededComposerPage(createManyTrackComposerProject(20), async (page) => {
      const shell = page.locator(".track-canvas-shell");
      const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-4"]');
      await shell.evaluate((element) => {
        element.scrollTop = 120;
        element.scrollLeft = 160;
      });
      await expect(handle).toBeInViewport();
      const initial = await shell.evaluate((element) => ({
        left: element.scrollLeft,
        top: element.scrollTop,
        pageTop: window.scrollY
      }));

      const decoyWheelConsumed = await page.evaluate(() => {
        const decoy = document.createElement("button");
        decoy.dataset.trackChrome = "reorder-handle";
        document.body.append(decoy);
        const consumed = !decoy.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaMode: WheelEvent.DOM_DELTA_LINE,
            deltaY: 2
          })
        );
        decoy.remove();
        return consumed;
      });
      expect(decoyWheelConsumed).toBe(false);
      expect(await shell.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }))).toEqual({
        left: initial.left,
        top: initial.top
      });

      const verticalConsumed = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return !element.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 2,
            clientY: rect.top + rect.height / 2,
            deltaMode: WheelEvent.DOM_DELTA_LINE,
            deltaY: 2
          })
        );
      });
      expect(verticalConsumed).toBe(true);
      await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(initial.top + 32);

      await handle.hover({ position: { x: 9, y: 12 } });
      await expect(handle).toHaveCSS("opacity", "1");
      const horizontalConsumed = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return !element.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 9,
            clientY: rect.top + rect.height / 2,
            deltaMode: WheelEvent.DOM_DELTA_LINE,
            deltaX: 3
          })
        );
      });
      expect(horizontalConsumed).toBe(true);
      await expect.poll(() => shell.evaluate((element) => element.scrollLeft)).toBe(initial.left + 48);
      expect(await page.evaluate(() => window.scrollY)).toBe(initial.pageTop);

      const canvas = shell.locator(":scope > canvas");
      const beforeZoom = await page.evaluate(
        ({ headerWidth, initialBeatWidth }) => {
          const shell = document.querySelector<HTMLElement>(".track-canvas-shell")!;
          const canvas = shell.querySelector<HTMLCanvasElement>(":scope > canvas")!;
          const handle = document.querySelector<HTMLElement>('[data-testid="track-reorder-handle"]')!;
          const x = handle.getBoundingClientRect().left + 9;
          const totalBeats = (canvas.width - headerWidth) / initialBeatWidth;
          const beatWidth = (canvas.width - headerWidth) / totalBeats;
          return {
            beatWidth,
            totalBeats,
            anchorBeat: (shell.scrollLeft + x - shell.getBoundingClientRect().left - headerWidth) / beatWidth
          };
        },
        { headerWidth: HEADER_WIDTH, initialBeatWidth: BEAT_WIDTH }
      );
      const zoomConsumed = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return !element.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 9,
            clientY: rect.top + rect.height / 2,
            ctrlKey: true,
            deltaY: -100
          })
        );
      });
      expect(zoomConsumed).toBe(true);
      await expect
        .poll(() =>
          canvas.evaluate(
            (element, args) => ((element as HTMLCanvasElement).width - args.headerWidth) / args.totalBeats,
            { headerWidth: HEADER_WIDTH, totalBeats: beforeZoom.totalBeats }
          )
        )
        .toBeGreaterThan(beforeZoom.beatWidth);
      await expect
        .poll(() =>
          page.evaluate(
            ({ headerWidth, totalBeats }) => {
              const shell = document.querySelector<HTMLElement>(".track-canvas-shell")!;
              const canvas = shell.querySelector<HTMLCanvasElement>(":scope > canvas")!;
              const handle = document.querySelector<HTMLElement>('[data-testid="track-reorder-handle"]')!;
              const x = handle.getBoundingClientRect().left + 9;
              const beatWidth = (canvas.width - headerWidth) / totalBeats;
              return (shell.scrollLeft + x - shell.getBoundingClientRect().left - headerWidth) / beatWidth;
            },
            { headerWidth: HEADER_WIDTH, totalBeats: beforeZoom.totalBeats }
          )
        )
        .toBeCloseTo(beforeZoom.anchorBeat, 1);
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

  test.each(["volume", "pan"] as const)(
    "closes the %s popover for non-scrolling pointer and keyboard reorders",
    async (kind) => {
      const project = createManyTrackComposerProject(4);
      await withSeededComposerPage(project, async (page) => {
        const shell = page.locator(".track-canvas-shell");
        const popover = page.locator(`[data-track-popover="${kind}"]`);
        const openPopover = async () => {
          await page.locator(`[data-track-chrome="${kind}-button"]`).first().click();
          await expect(popover).toBeVisible();
        };

        await openPopover();
        await page
          .locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]')
          .dragTo(page.locator('[data-track-control="instrument-selection"]').nth(1));
        await expect(popover).toHaveCount(0);
        expect(await shell.evaluate((element) => element.scrollTop)).toBe(0);
        const pointerOrder = await readTrackIds(page);

        await openPopover();
        const keyboardHandle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-3"]');
        await keyboardHandle.focus();
        await page.keyboard.press("ArrowUp");
        await expect(popover).toHaveCount(0);
        expect(await shell.evaluate((element) => element.scrollTop)).toBe(0);

        await openPopover();
        await page.mouse.move(600, 80);
        await keyboardHandle.focus();
        await page.keyboard.press("Control+z");
        await expect.poll(() => readTrackIds(page)).toEqual(pointerOrder);
        await expect(popover).toHaveCount(0);
        expect(await shell.evaluate((element) => element.scrollTop)).toBe(0);
      });
    },
    120_000
  );

  test("Escape exits reorder mode and dismisses a mixer popover", async () => {
    const project = createManyTrackComposerProject(4);
    await withSeededComposerPage(project, async (page) => {
      const popover = page.locator('[data-track-popover="volume"]');
      await page.locator('[data-track-chrome="volume-button"]').first().click();
      await expect(popover).toBeVisible();

      const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]');
      await handle.focus();
      await page.evaluate(() => {
        const observedWindow = window as typeof window & { reorderEscapePhases?: string[] };
        observedWindow.reorderEscapePhases = [];
        window.addEventListener("keydown", (event) => observedWindow.reorderEscapePhases?.push(`down:${event.key}`));
        window.addEventListener("keyup", (event) => observedWindow.reorderEscapePhases?.push(`up:${event.key}`));
      });

      await page.keyboard.press("Escape");

      await expect(popover).toHaveCount(0);
      expect(await readTrackIds(page)).toEqual(project.tracks.map((track) => track.id));
      expect(await readFirstTrackNoteCount(page)).toBe(0);
      expect(
        await page.evaluate(() => (window as typeof window & { reorderEscapePhases?: string[] }).reorderEscapePhases)
      ).toEqual(["down:Escape", "up:Escape"]);
      await expect(page.locator('[data-track-control="playhead-tabstop"]')).toBeFocused();
      await expect(page.locator("[data-composer-actions-bar]")).toHaveAttribute("data-composer-mode", "editing");
    });
  }, 120_000);

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
      const reorderStatus = page.locator('[role="status"][aria-atomic="true"]');
      await expect(lastTrackHandle).toHaveAccessibleName(
        "Reorder Scroll Track 10, position 10 of 10. Use Arrow Up or Arrow Down to move."
      );

      await lastTrackHandle.focus();
      await expect(lastTrackHandle).toHaveCSS("opacity", "1");
      await expect
        .poll(() =>
          lastTrackHandle.evaluate((element) =>
            Array.from(document.styleSheets).some((sheet) =>
              Array.from(sheet.cssRules).some(
                (rule) =>
                  rule instanceof CSSStyleRule &&
                  rule.style.opacity === "1" &&
                  !rule.selectorText.includes(":has(") &&
                  rule.selectorText.split(",").some((selector) => element.matches(selector.trim()))
              )
            )
          )
        )
        .toBe(true);

      for (const key of ["Space", "Enter", "Backspace", "Alt+x"]) {
        await page.keyboard.press(key);
      }
      // Reorder mode must not place notes or change their pitch.
      await page.keyboard.press("q");
      await page.keyboard.press("Shift+q");
      await expect(lastTrackHandle).toBeFocused();
      expect(await readFirstTrackNoteCount(page)).toBe(0);

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

  test("keeps a focused keyboard reorder handle visible across viewport edges and unequal track heights", async () => {
    const project = createManyTrackComposerProject(10);
    await withSeededComposerPage(project, async (page) => {
      const shell = page.locator(".track-canvas-shell");
      await page.getByTestId("track-name-button").nth(6).click();
      await page.getByRole("button", { name: "Expand macro lanes" }).click();

      await shell.evaluate((element, scrollLeft) => {
        element.scrollTop = 0;
        element.scrollLeft = scrollLeft;
      }, 3 * BEAT_WIDTH);
      const horizontalScroll = await shell.evaluate((element) => element.scrollLeft);
      const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-6"]');
      await handle.focus();

      const readVisibility = () =>
        handle.evaluate((element, rulerHeight) => {
          const shell = document.querySelector<HTMLElement>(".track-canvas-shell");
          if (!shell) return null;
          const shellRect = shell.getBoundingClientRect();
          const handleRect = element.getBoundingClientRect();
          const visibleTop = Math.max(shellRect.top + shell.clientTop + rulerHeight, 0);
          const visibleBottom = Math.min(shellRect.top + shell.clientTop + shell.clientHeight, window.innerHeight);
          return {
            focused: document.activeElement === element,
            fullyVisible: handleRect.top >= visibleTop - 0.5 && handleRect.bottom <= visibleBottom + 0.5,
            scrollLeft: shell.scrollLeft,
            scrollTop: shell.scrollTop
          };
        }, RULER_HEIGHT);

      await expect.poll(readVisibility).toMatchObject({
        focused: true,
        fullyVisible: true,
        scrollLeft: horizontalScroll
      });
      const initialScrollTop = (await readVisibility())!.scrollTop;

      for (let index = 0; index < 2; index += 1) {
        await page.keyboard.press("ArrowDown");
        await expect.poll(readVisibility).toMatchObject({
          focused: true,
          fullyVisible: true,
          scrollLeft: horizontalScroll
        });
      }
      const bottomScrollTop = (await readVisibility())!.scrollTop;
      expect(bottomScrollTop).toBeGreaterThan(initialScrollTop);

      for (let index = 0; index < 6; index += 1) {
        await page.keyboard.press("ArrowUp");
        await expect.poll(readVisibility).toMatchObject({
          focused: true,
          fullyVisible: true,
          scrollLeft: horizontalScroll
        });
      }
      expect((await readVisibility())!.scrollTop).toBeLessThan(bottomScrollTop);
      await expect(handle).toBeFocused();
    });
  }, 120_000);

  test("settles focus scrolling for an oversized reorder handle and moves once per plain arrow", async () => {
    const project = createManyTrackComposerProject(6);
    await withSeededComposerPage(project, async (page) => {
      const shell = page.locator(".track-canvas-shell");
      await page.getByTestId("track-name-button").first().click();
      await page.getByRole("button", { name: "Expand macro lanes" }).click();
      await shell.evaluate((element) => {
        element.style.flex = "0 0 96px";
        element.style.height = "96px";
        element.style.minHeight = "96px";
        element.style.maxHeight = "96px";
      });

      const handle = page.locator('[data-testid="track-reorder-handle"][data-track-id="scroll-track-1"]');
      await expect
        .poll(async () => {
          const handleBox = await handle.boundingBox();
          return handleBox ? handleBox.height : 0;
        })
        .toBeGreaterThan(96 - RULER_HEIGHT);
      await handle.focus();
      await waitForScrollStability(shell);
      const settledBeforeMove = await readScrollTopAcrossFrames(shell, 5);
      expect(new Set(settledBeforeMove).size).toBe(1);

      await page.keyboard.press("ArrowDown");
      await expect
        .poll(() => readTrackIds(page))
        .toEqual([
          "scroll-track-2",
          "scroll-track-1",
          "scroll-track-3",
          "scroll-track-4",
          "scroll-track-5",
          "scroll-track-6"
        ]);
      await waitForScrollStability(shell);
      const settledAfterMove = await readScrollTopAcrossFrames(shell, 5);
      expect(new Set(settledAfterMove).size).toBe(1);
      expect((await readTrackIds(page)).filter((id) => id === "scroll-track-1")).toHaveLength(1);
      await expect(handle).toBeFocused();
    });
  }, 120_000);

  test("consumes outward plain reorder arrows at both boundaries without moving or closing popovers", async () => {
    const project = createManyTrackComposerProject(6);
    await withSeededComposerPage(project, async (page) => {
      const shell = page.locator(".track-canvas-shell");
      const originalOrder = project.tracks.map((track) => track.id);
      const volumeButton = page.locator('[data-track-chrome="volume-button"]').first();
      const popover = page.locator('[data-track-popover="volume"]');
      await page.evaluate(() => {
        const observedWindow = window as typeof window & { boundaryReorderLeaks?: string[] };
        observedWindow.boundaryReorderLeaks = [];
        window.addEventListener("keydown", (event) => observedWindow.boundaryReorderLeaks?.push(event.key));
      });

      for (const [trackId, key] of [
        ["scroll-track-1", "ArrowUp"],
        ["scroll-track-6", "ArrowDown"]
      ] as const) {
        const handle = page.locator(`[data-testid="track-reorder-handle"][data-track-id="${trackId}"]`);
        await handle.focus();
        await waitForScrollStability(shell);
        await volumeButton.click();
        await expect(popover).toBeVisible();
        await handle.focus();
        const before = await shell.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
        const defaultPrevented = await handle.evaluate((element, pressedKey) => {
          const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: pressedKey });
          element.dispatchEvent(event);
          return event.defaultPrevented;
        }, key);
        expect(defaultPrevented).toBe(true);
        expect(await readTrackIds(page)).toEqual(originalOrder);
        await expect(handle).toBeFocused();
        await expect(popover).toBeVisible();
        expect(await shell.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }))).toEqual(
          before
        );
      }

      expect(
        await page.evaluate(() => (window as typeof window & { boundaryReorderLeaks?: string[] }).boundaryReorderLeaks)
      ).toEqual([]);
    });
  }, 120_000);
});

const reorderedLastTrackIds = (project: Project) => [
  ...project.tracks.slice(0, -2).map((track) => track.id),
  project.tracks.at(-1)!.id,
  project.tracks.at(-2)!.id
];

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
