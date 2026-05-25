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
  return activeElement?.dataset.trackControl === "playhead-tabstop";
};

export const isTrackChromeKeyboardTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('[data-track-chrome="header-overlays"]'));
};

export const focusLastTrackChromeTabStop = () => {
  const focusableElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-track-chrome='header-overlays'] button:not([disabled]), [data-track-chrome='header-overlays'] input:not([disabled]), [data-track-chrome='header-overlays'] select:not([disabled]), [data-track-chrome='header-overlays'] [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => element.offsetParent !== null);
  const lastFocusable = focusableElements[focusableElements.length - 1];
  if (!lastFocusable) {
    return false;
  }
  lastFocusable.focus();
  return true;
};
