import { describe, expect, it, vi } from "vitest";
import { createComposerInteraction, isReorderModeKey, type ComposerMode } from "@/lib/composerInteraction";

describe("composer interaction modes", () => {
  it.each(["playback", "recording"] as const)("excludes reorder focus and presses throughout %s", (mode) => {
    const state = createComposerInteraction();
    expect(state.startTransport(mode)).toBe(true);
    expect(state.focusReorder("a", true)).toBe(false);
    expect(state.holdReorder("a", true)).toBe(false);
    expect(state.startTransport("playback")).toBe(false);
    expect(state.startTransport("recording")).toBe(false);
    expect(state.getMode()).toBe(mode);
    state.finishTransport(mode);
    expect(state.focusReorder("a", true)).toBe(true);
    expect(state.getMode()).toBe("reordering");
  });

  it("excludes both transport starts while focused or held, even before rendering", () => {
    const state = createComposerInteraction();
    state.focusReorder("a", true);
    expect(state.startTransport("recording")).toBe(false);
    expect(state.startTransport("playback")).toBe(false);
    state.holdReorder("a", true);
    state.focusReorder("a", false);
    expect(state.getMode()).toBe("reordering");
    expect(state.startTransport("recording")).toBe(false);
    state.holdReorder("a", false);
    expect(state.getMode()).toBe("editing");
  });

  it("retains keyboard reorder mode after releasing a pointer hold", () => {
    const state = createComposerInteraction();
    state.holdReorder("a", true);
    state.focusReorder("a", true);
    state.holdReorder("a", false);
    expect(state.getMode()).toBe("reordering");
    state.focusReorder("a", false);
    expect(state.getMode()).toBe("editing");
  });

  it("keeps a native drag through pointercancel, but releases a simple press", () => {
    const state = createComposerInteraction();
    state.holdReorder("a", true);
    state.releaseReorderPress();
    expect(state.getMode()).toBe("editing");
    state.startReorderDrag("a");
    state.releaseReorderPress();
    expect(state.getMode()).toBe("reordering");
    expect(state.holdReorder("b", true)).toBe(false);
    state.holdReorder("a", false);
    expect(state.getMode()).toBe("editing");
  });

  it("ignores stale blur/release events for another handle", () => {
    const state = createComposerInteraction();
    state.focusReorder("a", true);
    state.focusReorder("b", true);
    state.focusReorder("a", false);
    expect(state.getMode()).toBe("reordering");
    state.holdReorder("b", true);
    state.focusReorder("b", false);
    state.holdReorder("a", false);
    expect(state.getMode()).toBe("reordering");
    state.holdReorder("b", false);
    expect(state.getMode()).toBe("editing");
  });

  it("cancels reorder ownership without cancelling a transport mode", () => {
    const state = createComposerInteraction();
    state.focusReorder("a", true);
    state.holdReorder("a", true);
    state.cancelReorder();
    expect(state.startTransport("recording")).toBe(true);
    state.cancelReorder();
    state.finishTransport("playback");
    expect(state.getMode()).toBe("recording");
    state.finishTransport("recording");
    expect(state.getMode()).toBe("editing");
  });

  it("passes the new mode only on changes and unsubscribes cleanly", () => {
    const state = createComposerInteraction();
    const listener = vi.fn<(mode: ComposerMode) => void>();
    const unsubscribe = state.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    state.focusReorder("a", true);
    state.holdReorder("a", true);
    expect(listener.mock.calls).toEqual([["reordering"]]);
    state.cancelReorder();
    state.startTransport("playback");
    state.finishTransport("playback");
    state.startTransport("recording");
    expect(listener.mock.calls).toEqual([["reordering"], ["editing"], ["playback"], ["editing"], ["recording"]]);
    unsubscribe();
    state.finishTransport("recording");
    expect(listener).toHaveBeenCalledTimes(5);
  });
});

describe("reorder mode keyboard vocabulary", () => {
  const key = (key: string, modifiers = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers
  });
  it.each(["ArrowUp", "ArrowDown", "Tab", "Escape"])("allows %s", (value) => {
    expect(isReorderModeKey(key(value))).toBe(true);
  });
  it("allows native reverse Tab and Undo/Redo", () => {
    expect(isReorderModeKey(key("Tab", { shiftKey: true }))).toBe(true);
    for (const modifier of ["ctrlKey", "metaKey"]) {
      expect(isReorderModeKey(key("z", { [modifier]: true }))).toBe(true);
      expect(isReorderModeKey(key("Z", { [modifier]: true, shiftKey: true }))).toBe(true);
      expect(isReorderModeKey(key("y", { [modifier]: true }))).toBe(true);
    }
    expect(isReorderModeKey(key("f", { ctrlKey: true }))).toBe(true);
    expect(isReorderModeKey(key("+", { metaKey: true }))).toBe(true);
  });
  it.each(["z", "q", "Enter", " ", "Backspace", "Delete", "-", "=", "+", "_", "?", "ArrowLeft", "ArrowRight"])(
    "blocks unrelated %s without classifying pitches",
    (value) => {
      expect(isReorderModeKey(key(value))).toBe(false);
    }
  );
  it("blocks modified navigation and clipboard edits", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) {
      for (const arrow of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        expect(isReorderModeKey(key(arrow, { [modifier]: true }))).toBe(false);
      }
    }
    expect(isReorderModeKey(key("v", { ctrlKey: true }))).toBe(false);
  });
});
