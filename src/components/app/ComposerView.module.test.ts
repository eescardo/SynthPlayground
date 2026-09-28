import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ComposerView layout styles", () => {
  it("keeps the conventional viewport fallback before the dynamic viewport override", () => {
    const css = readFileSync(new URL("./ComposerView.module.css", import.meta.url), "utf8");

    expect(css).toMatch(/height:\s*calc\(100vh - 1\.6rem\);\s*height:\s*calc\(100dvh - 1\.6rem\);/);
  });
});
