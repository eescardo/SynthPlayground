export type ComposerMode = "editing" | "reordering" | "playback" | "recording";

/** Shared interaction contract; boolean actions report whether the current mode permits them. */
export type ComposerInteraction = {
  getMode: () => ComposerMode;
  subscribe: (listener: (mode: ComposerMode) => void) => () => void;
  startTransport: (next: "playback" | "recording") => boolean;
  finishTransport: (expected: "playback" | "recording") => void;
  focusReorder: (trackId: string, focused: boolean) => boolean;
  holdReorder: (trackId: string, held: boolean) => boolean;
  startReorderDrag: (trackId: string) => boolean;
  releaseReorderPress: () => void;
  cancelReorder: () => void;
};

/** One composer-wide mode; recording includes count-in and playback startup. */
export function createComposerInteraction(): ComposerInteraction {
  let mode: ComposerMode = "editing";
  let focusedReorderTrackId: string | null = null;
  let heldReorderTrackId: string | null = null;
  let dragging = false;
  const listeners = new Set<(mode: ComposerMode) => void>();
  const setMode = (next: ComposerMode) => {
    if (next === mode) return;
    mode = next;
    for (const listener of listeners) listener(next);
  };
  const reconcileReorder = () => {
    if (mode === "editing" || mode === "reordering") {
      setMode(focusedReorderTrackId || heldReorderTrackId ? "reordering" : "editing");
    }
  };
  const holdReorder = (trackId: string, held: boolean) => {
    if (mode !== "editing" && mode !== "reordering") return false;
    if (held) {
      if (heldReorderTrackId && heldReorderTrackId !== trackId) return false;
      heldReorderTrackId = trackId;
    } else if (heldReorderTrackId === trackId) {
      heldReorderTrackId = null;
      dragging = false;
    }
    reconcileReorder();
    return true;
  };
  return {
    getMode: () => mode,
    subscribe: (listener: (mode: ComposerMode) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startTransport: (next: "playback" | "recording") => {
      if (mode !== "editing") return false;
      setMode(next);
      return true;
    },
    finishTransport: (expected: "playback" | "recording") => {
      if (mode === expected) setMode("editing");
    },
    focusReorder: (trackId: string, focused: boolean) => {
      if (mode !== "editing" && mode !== "reordering") return false;
      if (focused) focusedReorderTrackId = trackId;
      else if (focusedReorderTrackId === trackId) focusedReorderTrackId = null;
      reconcileReorder();
      return true;
    },
    holdReorder,
    startReorderDrag: (trackId: string) => {
      if (!holdReorder(trackId, true)) return false;
      dragging = true;
      return true;
    },
    releaseReorderPress: () => {
      // Native DnD sends pointercancel after dragstart; the drag owns release now.
      if (!dragging && heldReorderTrackId) holdReorder(heldReorderTrackId, false);
    },
    cancelReorder: () => {
      focusedReorderTrackId = null;
      heldReorderTrackId = null;
      dragging = false;
      if (mode === "reordering") setMode("editing");
    }
  };
}

/** Reorder mode has a deliberately small keyboard vocabulary; keyup is never filtered. */
export function isReorderModeKey(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">) {
  if (event.key === "Tab" || event.key === "Escape") return true;
  if (event.ctrlKey || event.metaKey) {
    // Keep Undo/Redo and browser shortcuts available, but not canvas edits.
    return !["x", "v", "i", "backspace", "delete", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(
      event.key.toLowerCase()
    );
  }
  return !event.altKey && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown");
}
