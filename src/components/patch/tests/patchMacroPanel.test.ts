import { describe, expect, it } from "vitest";

import { resolveMacroSliderKeyboardValue } from "@/lib/patch/macroSliderKeyboard";

describe("patch macro panel", () => {
  it("moves macro sliders by hardware navigation without snapping to keyframes", () => {
    expect(resolveMacroSliderKeyboardValue(0.5, "ArrowRight")).toBe(0.501);
    expect(resolveMacroSliderKeyboardValue(0.5, "ArrowLeft")).toBe(0.499);
    expect(resolveMacroSliderKeyboardValue(0.5, "ArrowUp")).toBe(0.501);
    expect(resolveMacroSliderKeyboardValue(0.5, "ArrowDown")).toBe(0.499);
  });

  it("supports larger keyboard jumps and clamps to the macro range", () => {
    expect(resolveMacroSliderKeyboardValue(0.95, "PageUp")).toBe(1);
    expect(resolveMacroSliderKeyboardValue(0.05, "PageDown")).toBe(0);
    expect(resolveMacroSliderKeyboardValue(0.42, "Home")).toBe(0);
    expect(resolveMacroSliderKeyboardValue(0.42, "End")).toBe(1);
    expect(resolveMacroSliderKeyboardValue(0.42, "Enter")).toBeNull();
  });
});
