import { expect, Locator, Page } from "@playwright/test";

const reviewZoom = Number(process.env.UI_CAPTURE_REVIEW_ZOOM ?? 0.82);
const marqueeHoldMs = Number(process.env.UI_CAPTURE_MARQUEE_HOLD_MS ?? 250);

export const applySelectionReviewFraming = async (page: Page) => {
  await page.evaluate((zoom) => {
    document.documentElement.style.zoom = String(zoom);
    window.scrollTo(0, 0);
  }, reviewZoom);
};

export const dragCanvasRegion = async (
  page: Page,
  canvas: Locator,
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps = 18
) => {
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Could not determine track canvas bounds.");
  }

  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.waitForTimeout(marqueeHoldMs);
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps });
  await page.waitForTimeout(marqueeHoldMs);
  await page.mouse.up();
};

export const showSelectionActionsPopover = async (page: Page, canvas: Locator) => {
  await expect(page.locator(".track-name-button").first()).toBeVisible();
  await page.waitForTimeout(500);

  const attempts = [
    { start: { x: 188, y: 42 }, end: { x: 840, y: 168 }, steps: 24 },
    { start: { x: 220, y: 54 }, end: { x: 980, y: 210 }, steps: 28 }
  ];

  for (const attempt of attempts) {
    await dragCanvasRegion(page, canvas, attempt.start, attempt.end, attempt.steps);
    await page.waitForTimeout(350);

    if (await page.locator(".selection-actions-popover").isVisible()) {
      return;
    }
  }

  throw new Error("Selection actions popover did not appear after marquee selection attempts.");
};
