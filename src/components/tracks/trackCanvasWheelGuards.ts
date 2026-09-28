export function isTimelinePopoverWheelEvent(event: WheelEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(".timeline-actions-popover"));
}

export function consumeTimelinePopoverWheelEvent(event: WheelEvent): boolean {
  if (!isTimelinePopoverWheelEvent(event)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  return true;
}

export const wheelDeltaToPixels = (delta: number, deltaMode: number, pageSize: number): number => {
  if (deltaMode === 1) {
    return delta * 16;
  }
  if (deltaMode === 2) {
    return delta * pageSize;
  }
  return delta;
};
