"use client";

import { HEADER_WIDTH } from "@/components/tracks/trackCanvasConstants";

export const getTrackCanvasVisibleBeatRange = (): { startBeat: number; endBeat: number } | null => {
  const shell = document.querySelector<HTMLElement>('[data-track-canvas-shell="true"]');
  const beatWidth = Number(shell?.dataset.beatWidth);
  const startBeat =
    shell && Number.isFinite(beatWidth) && beatWidth > 0
      ? Math.max(0, shell.scrollLeft / beatWidth)
      : Number(shell?.dataset.visibleBeatStart);
  const endBeat =
    shell && Number.isFinite(beatWidth) && beatWidth > 0
      ? Math.max(startBeat, (shell.scrollLeft + shell.clientWidth - HEADER_WIDTH) / beatWidth)
      : Number(shell?.dataset.visibleBeatEnd);
  if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || endBeat < startBeat) {
    return null;
  }
  return { startBeat, endBeat };
};

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
  return Boolean(element?.closest?.('[data-track-chrome="header-overlays"]'));
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
