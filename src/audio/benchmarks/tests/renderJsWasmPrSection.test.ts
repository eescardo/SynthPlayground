import { describe, expect, it } from "vitest";
import { renderJsWasmPrSection, type JsWasmCompareResult } from "@/audio/benchmarks/renderJsWasmPrSection";

const makeResult = (jsMs: number, wasmMs: number, maxAbsDiff = 0.0267): JsWasmCompareResult => ({
  scenarioId: "stress-3min-35tracks",
  exactParity: false,
  mediumCompare: {
    scenario: {
      name: "Stress scenario"
    },
    left: {
      maxAbsDiff
    },
    right: {
      maxAbsDiff
    }
  },
  benchmarks: [
    {
      label: "medium",
      backend: "js",
      runs: 1,
      renderSongMs: {
        min: jsMs,
        max: jsMs,
        mean: jsMs
      }
    },
    {
      label: "medium",
      backend: "wasm",
      runs: 1,
      renderSongMs: {
        min: wasmMs,
        max: wasmMs,
        mean: wasmMs
      }
    }
  ]
});

describe("renderJsWasmPrSection", () => {
  it("renders a head-only section when no base result exists", () => {
    const markdown = renderJsWasmPrSection(makeResult(1000, 400));
    expect(markdown).toContain("## JS vs WASM");
    expect(markdown).toContain("not available");
    expect(markdown).toContain("2.50x");
  });

  it("renders base-to-head speedup and wasm deltas", () => {
    const markdown = renderJsWasmPrSection(makeResult(900, 300), makeResult(1000, 400));
    expect(markdown).toContain("| WASM render | 400ms | 300ms | -25.0% |");
    expect(markdown).toContain("| JS/WASM speedup | 2.50x | 3.00x | +20.0% |");
  });
});
