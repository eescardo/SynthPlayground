import { describe, expect, it } from "vitest";

import { resolveReplaceWireKeyboardAction } from "@/hooks/patch/usePatchWireGesture";

describe("patch wire gesture keyboard handling", () => {
  it("only consumes replace prompt arrows when moving between prompt buttons", () => {
    expect(resolveReplaceWireKeyboardAction("yes", "ArrowLeft")).toBe("selectNo");
    expect(resolveReplaceWireKeyboardAction("no", "ArrowLeft")).toBeNull();

    expect(resolveReplaceWireKeyboardAction("no", "ArrowRight")).toBe("selectYes");
    expect(resolveReplaceWireKeyboardAction("yes", "ArrowRight")).toBeNull();
  });

  it("keeps Enter scoped to the replace prompt action", () => {
    expect(resolveReplaceWireKeyboardAction("no", "Enter")).toBe("confirm");
    expect(resolveReplaceWireKeyboardAction("yes", "Enter")).toBe("confirm");
    expect(resolveReplaceWireKeyboardAction("no", "ArrowDown")).toBeNull();
  });
});
