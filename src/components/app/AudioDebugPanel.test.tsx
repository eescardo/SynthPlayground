import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioDebugPanel } from "./AudioDebugPanel";

describe("AudioDebugPanel", () => {
  it("renders the debug toggle button by default", () => {
    const html = renderToStaticMarkup(<AudioDebugPanel rendererLabel="js" />);
    expect(html).toContain("Toggle audio debug panel");
    expect(html).toContain(">dbg<");
    expect(html).not.toContain("Audio Debug");
  });

  it("renders the renderer label when opened", () => {
    const html = renderToStaticMarkup(<AudioDebugPanel rendererLabel="wasm-strict" defaultOpen />);
    expect(html).toContain("Audio Debug");
    expect(html).toContain("Renderer:");
    expect(html).toContain("wasm-strict");
  });
});
