import { describe, expect, it, vi } from "vitest";
import { createAudioDebugPanelViewModel } from "./audioDebugPanelModel";

describe("createAudioDebugPanelViewModel", () => {
  it("returns collapsed button state without a dialog", () => {
    const onToggle = vi.fn();
    const model = createAudioDebugPanelViewModel({
      rendererLabel: "js",
      open: false,
      onToggle
    });

    expect(model.dialog).toBeNull();
    expect(model.button.ariaLabel).toBe("Toggle audio debug panel");
    expect(model.button.ariaExpanded).toBe(false);
    expect(model.button.label).toBe("dbg");

    model.button.onClick();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("returns expanded dialog state with the renderer label", () => {
    const model = createAudioDebugPanelViewModel({
      rendererLabel: "wasm",
      open: true,
      onToggle: vi.fn()
    });

    expect(model.dialog).toEqual({
      ariaLabel: "Audio renderer debug",
      title: "Audio Debug",
      rendererLabel: "wasm"
    });
    expect(model.button.ariaExpanded).toBe(true);
  });
});
