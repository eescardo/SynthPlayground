"use client";

export const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
    (element.tagName === "INPUT" ||
      element.tagName === "SELECT" ||
      element.tagName === "TEXTAREA" ||
      element.isContentEditable)
  );
};

export const isModifierChord = (event: KeyboardEvent) => event.metaKey || event.ctrlKey || event.altKey;

export const isPlayheadTabStopFocused = () => {
  const activeElement = document.activeElement as HTMLElement | null;
  return activeElement?.classList.contains("track-canvas-playhead-tabstop") ?? false;
};

export const focusLastTrackChromeTabStop = () => {
  const focusableElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".track-header-overlays button:not([disabled]), .track-header-overlays input:not([disabled]), .track-header-overlays select:not([disabled]), .track-header-overlays [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => element.offsetParent !== null);
  const lastFocusable = focusableElements[focusableElements.length - 1];
  if (!lastFocusable) {
    return false;
  }
  lastFocusable.focus();
  return true;
};
