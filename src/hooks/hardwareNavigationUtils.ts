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
  return Boolean(element?.closest?.('[data-track-chrome="header-overlays"], [data-track-chrome="reorder-handle"]'));
};

type TrackControlKeyboardOwner = "navigation" | "global-shortcut" | "pitch-preview";
type TrackControlKeyEvent = Pick<KeyboardEvent, "target" | "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/**
 * Window-level shortcut owners check focus themselves; controls need not swallow
 * unrelated keydowns. Recording owns musical input separately, and keyup must
 * remain available to whichever owner started a held interaction.
 */
export const canHandleTrackControlKeyDown = (
  event: TrackControlKeyEvent,
  owner: TrackControlKeyboardOwner
): boolean => {
  const element = event.target as HTMLElement | null;
  const reorderFocused = Boolean(element?.closest?.('[data-track-chrome="reorder-handle"]'));
  if (owner === "navigation") {
    if (!isTrackChromeKeyboardTarget(event.target)) return true;
    const arrow = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key);
    // Plain vertical arrows belong to reordering; plain horizontal arrows must
    // not seek the playhead while a grip is focused. Modified navigation remains global.
    return arrow && (!reorderFocused || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
  }
  if (!reorderFocused) return true;
  return owner === "global-shortcut" && (event.key === "Escape" || event.ctrlKey || event.metaKey);
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
