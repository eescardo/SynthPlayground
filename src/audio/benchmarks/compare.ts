import {
  AudioBenchmarkComparisonBundle,
  AudioBenchmarkMetricSummaries,
  AudioBenchmarkBundleResult,
  AudioBenchmarkScenarioComparison,
  AudioBenchmarkScenarioResult
} from "@/audio/benchmarks/types";

const metricLabel: Record<keyof AudioBenchmarkMetricSummaries, string> = {
  compileProjectMs: "Bootstrap renderer",
  scheduleEventsMs: "Collect full-song events (benchmark-only)",
  transportSetupMs: "Prime transport window",
  renderSongMs: "Render full song",
  realtimeFactor: "Realtime factor",
  eventsPerSecond: "Events/sec during render",
  cpuUserMs: "CPU user time",
  cpuSystemMs: "CPU system time",
  rssDeltaMb: "RSS delta",
  heapUsedDeltaMb: "Heap delta",
  peakHeapMb: "Peak heap",
  renderedBlocks: "Rendered blocks",
  renderedSamples: "Rendered samples",
  eventCount: "Event count",
  noteEventCount: "Note events",
  macroEventCount: "Macro events",
  outputAbsSum: "Output abs sum"
};

const metricUnit: Partial<Record<keyof AudioBenchmarkMetricSummaries, string>> = {
  compileProjectMs: "ms",
  scheduleEventsMs: "ms",
  transportSetupMs: "ms",
  renderSongMs: "ms",
  realtimeFactor: "x",
  eventsPerSecond: "/s",
  cpuUserMs: "ms",
  cpuSystemMs: "ms",
  rssDeltaMb: "MB",
  heapUsedDeltaMb: "MB",
  peakHeapMb: "MB"
};

const lowerIsBetter = new Set<keyof AudioBenchmarkMetricSummaries>([
  "compileProjectMs",
  "scheduleEventsMs",
  "transportSetupMs",
  "renderSongMs",
  "cpuUserMs",
  "cpuSystemMs",
  "rssDeltaMb",
  "heapUsedDeltaMb",
  "peakHeapMb"
]);

const FORMATTERS = {
  integer: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
  oneDecimal: new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  twoDecimals: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};

const integerMetrics = new Set<keyof AudioBenchmarkMetricSummaries>([
  "renderedBlocks",
  "renderedSamples",
  "eventCount",
  "noteEventCount",
  "macroEventCount"
]);

const formatNumber = (value: number, key: keyof AudioBenchmarkMetricSummaries) => {
  const formatter = integerMetrics.has(key)
    ? FORMATTERS.integer
    : Math.abs(value) >= 100 || Number.isInteger(value)
      ? FORMATTERS.oneDecimal
      : FORMATTERS.twoDecimals;
  const numeric = formatter.format(value);
  const unit = metricUnit[key] ?? "";
  return `${numeric}${unit}`;
};

const formatOptional = (value: number | null | undefined, key: keyof AudioBenchmarkMetricSummaries) =>
  typeof value === "number" ? formatNumber(value, key) : "not available";

const formatPercent = (value: number | null) =>
  value === null ? "not available" : `${value >= 0 ? "+" : ""}${FORMATTERS.oneDecimal.format(value)}%`;

const deltaDirection = (key: keyof AudioBenchmarkMetricSummaries, delta: number | null) => {
  if (delta === null) return "not available";
  if (Math.abs(delta) < 1e-9) return "-";
  const improved = lowerIsBetter.has(key) ? delta < 0 : delta > 0;
  return improved ? "better" : "worse";
};

const compareScenario = (
  base: AudioBenchmarkScenarioResult | null,
  head: AudioBenchmarkScenarioResult
): AudioBenchmarkScenarioComparison => {
  const deltas = {} as AudioBenchmarkScenarioComparison["deltas"];
  (Object.keys(head.summaries) as Array<keyof AudioBenchmarkMetricSummaries>).forEach((key) => {
    const baseMean = base?.summaries[key]?.mean;
    const headMean = head.summaries[key].mean;
    deltas[key] = {
      absolute: typeof baseMean === "number" ? headMean - baseMean : null,
      percent: typeof baseMean === "number" && Math.abs(baseMean) > 1e-9 ? ((headMean - baseMean) / baseMean) * 100 : null
    };
  });
  return {
    scenarioId: head.scenario.id,
    base,
    head,
    deltas
  };
};

export const compareBenchmarkBundles = (
  base: AudioBenchmarkBundleResult | null,
  head: AudioBenchmarkBundleResult
): AudioBenchmarkComparisonBundle => {
  const baseById = new Map((base?.scenarios ?? []).map((scenario) => [scenario.scenario.id, scenario]));
  return {
    base,
    head,
    scenarios: head.scenarios.map((scenario) => compareScenario(baseById.get(scenario.scenario.id) ?? null, scenario))
  };
};

const renderScenarioMarkdown = (
  comparison: AudioBenchmarkScenarioComparison,
  baseGitRef: string,
  headGitRef: string
) => {
  const { base, head, deltas } = comparison;
  const keys: Array<keyof AudioBenchmarkMetricSummaries> = [
    "compileProjectMs",
    "scheduleEventsMs",
    "transportSetupMs",
    "renderSongMs",
    "realtimeFactor",
    "cpuUserMs",
    "cpuSystemMs",
    "peakHeapMb",
    "eventCount",
    "noteEventCount",
    "macroEventCount"
  ];

  const rows = keys.map((key) => {
    const baseSummary = base?.summaries[key];
    const headSummary = head.summaries[key];
    const delta = deltas[key];
    return `| ${metricLabel[key]} | ${formatOptional(baseSummary?.mean, key)} | ${formatOptional(headSummary.mean, key)} | ${formatOptional(delta.absolute, key)} | ${formatPercent(delta.percent)} | ${deltaDirection(key, delta.absolute)} |`;
  }).join("\n");

  return [
    `### ${head.scenario.name}`,
    `Scenario ID: \`${head.scenario.id}\``,
    "",
    `- Runs: ${head.runsRequested} measured, ${head.warmupRuns} warmup`,
    `- Song: ${FORMATTERS.integer.format(head.scenario.durationBeats)} beats at ${FORMATTERS.integer.format(head.scenario.tempo)} BPM`,
    `- Tracks: ${FORMATTERS.integer.format(head.scenario.trackCount)} total, ${FORMATTERS.integer.format(head.scenario.automatedTrackCount)} with automation`,
    "- Benchmark note: `Collect full-song events (benchmark-only)` measures a diagnostic full-song scheduler pass that the live app does not perform before playback starts.",
    ...(base ? [] : ["- Base benchmark: not available on the PR base branch"]),
    "",
    `| Metric | Base (${base ? baseGitRef : "not available"}) | Head (${headGitRef}) | Abs delta | % delta | Direction |`,
    "| --- | ---: | ---: | ---: | ---: | --- |",
    rows
  ].join("\n");
};

export const renderBenchmarkComparisonMarkdown = (comparison: AudioBenchmarkComparisonBundle): string => {
  const baseGitRef = comparison.base?.gitRef ?? "base";
  const headGitRef = comparison.head.gitRef ?? "head";
  const scenarioSections = comparison.scenarios
    .map((scenario) => renderScenarioMarkdown(scenario, baseGitRef, headGitRef))
    .join("\n\n");

  return [
    `System: ${comparison.head.system.platform} ${comparison.head.system.arch}, Node ${comparison.head.system.node}`,
    "",
    scenarioSections
  ].join("\n");
};
