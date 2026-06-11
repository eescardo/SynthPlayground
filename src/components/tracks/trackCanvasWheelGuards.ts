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
