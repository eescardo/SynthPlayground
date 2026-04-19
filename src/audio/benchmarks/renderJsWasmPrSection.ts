export interface JsWasmBenchSummary {
  label: string;
  backend: "js" | "wasm";
  runs: number;
  renderSongMs: {
    min: number;
    max: number;
    mean: number;
  };
}

export interface JsWasmCompareResult {
  scenarioId: string;
  exactParity: boolean;
  mediumCompare: {
    scenario: {
      name: string;
    };
    left: {
      maxAbsDiff: number;
    };
    right: {
      maxAbsDiff: number;
    };
  };
  benchmarks: JsWasmBenchSummary[];
}

interface JsWasmSummary {
  scenarioName: string;
  scenarioId: string;
  jsMs: number;
  wasmMs: number;
  speedup: number;
  maxAbsDiff: number;
  exactParity: boolean;
}

const formatMs = (value: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}ms`;
const formatRatio = (value: number) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
const formatDelta = (value: number | null) =>
  value === null
    ? "not available"
    : `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
const formatDiff = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(value);

const getBench = (result: JsWasmCompareResult, backend: "js" | "wasm") => {
  const bench = result.benchmarks.find((entry) => entry.backend === backend && entry.label === "medium");
  if (!bench) {
    throw new Error(`Missing ${backend} benchmark in ${result.scenarioId}`);
  }
  return bench;
};

const summarize = (result: JsWasmCompareResult): JsWasmSummary => {
  const js = getBench(result, "js");
  const wasm = getBench(result, "wasm");
  return {
    scenarioName: result.mediumCompare.scenario.name,
    scenarioId: result.scenarioId,
    jsMs: js.renderSongMs.mean,
    wasmMs: wasm.renderSongMs.mean,
    speedup: js.renderSongMs.mean / wasm.renderSongMs.mean,
    maxAbsDiff: Math.max(result.mediumCompare.left.maxAbsDiff, result.mediumCompare.right.maxAbsDiff),
    exactParity: result.exactParity
  };
};

export const renderJsWasmPrSection = (headResult: JsWasmCompareResult, baseResult?: JsWasmCompareResult | null) => {
  const head = summarize(headResult);
  const base = baseResult ? summarize(baseResult) : null;

  const wasmDeltaPercent = base ? ((head.wasmMs - base.wasmMs) / base.wasmMs) * 100 : null;
  const speedupDeltaPercent = base ? ((head.speedup - base.speedup) / base.speedup) * 100 : null;

  return [
    "## JS vs WASM",
    "",
    `Scenario: ${head.scenarioName} (\`${head.scenarioId}\`)`,
    "",
    "| Metric | Base | Head | Delta |",
    "| --- | ---: | ---: | ---: |",
    `| JS render | ${base ? formatMs(base.jsMs) : "not available"} | ${formatMs(head.jsMs)} | ${base ? formatDelta(((head.jsMs - base.jsMs) / base.jsMs) * 100) : "not available"} |`,
    `| WASM render | ${base ? formatMs(base.wasmMs) : "not available"} | ${formatMs(head.wasmMs)} | ${formatDelta(wasmDeltaPercent)} |`,
    `| JS/WASM speedup | ${base ? formatRatio(base.speedup) : "not available"} | ${formatRatio(head.speedup)} | ${formatDelta(speedupDeltaPercent)} |`,
    `| Max abs diff | ${base ? formatDiff(base.maxAbsDiff) : "not available"} | ${formatDiff(head.maxAbsDiff)} | ${base ? formatDelta(((head.maxAbsDiff - base.maxAbsDiff) / Math.max(base.maxAbsDiff, 1e-12)) * 100) : "not available"} |`,
    `| Exact parity | ${base ? (base.exactParity ? "yes" : "no") : "not available"} | ${head.exactParity ? "yes" : "no"} | - |`
  ].join("\n");
};
