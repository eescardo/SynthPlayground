import { describe, expect, it } from "vitest";

import { splitQuickHelpShortcutKeys } from "@/components/quickHelpShortcuts";

describe("splitQuickHelpShortcutKeys", () => {
  it("keeps slash-separated alternatives together so literal plus keys render", () => {
    expect(splitQuickHelpShortcutKeys("_ / +")).toEqual(["_ / +"]);
    expect(splitQuickHelpShortcutKeys("Tab / Shift+Tab")).toEqual(["Tab / Shift+Tab"]);
  });

  it("splits modifier chords into separate keycaps", () => {
    expect(splitQuickHelpShortcutKeys("Ctrl+Shift+`")).toEqual(["Ctrl", "Shift", "`"]);
    expect(splitQuickHelpShortcutKeys("Cmd+Backspace")).toEqual(["Cmd", "Backspace"]);
  });
});
