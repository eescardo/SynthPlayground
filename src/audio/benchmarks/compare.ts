import { AudioBenchmarkComparison, AudioBenchmarkMetricSummaries, AudioBenchmarkSuiteResult } from "@/audio/benchmarks/types";

const metricLabel: Record<keyof AudioBenchmarkMetricSummaries, string> = {
  compileProjectMs: "Compile project (ms)",
  scheduleEventsMs: "Schedule full song (ms)",
  transportSetupMs: "Transport setup (ms)",
  renderSongMs: "Render full song (ms)",
  realtimeFactor: "Realtime factor (x)",
  eventsPerSecond: "Events/sec during render",
  cpuUserMs: "CPU user time (ms)",
  cpuSystemMs: "CPU system time (ms)",
  rssDeltaMb: "RSS delta (MB)",
  heapUsedDeltaMb: "Heap delta (MB)",
  peakHeapMb: "Peak heap (MB)",
  renderedBlocks: "Rendered blocks",
  renderedSamples: "Rendered samples",
  eventCount: "Event count",
  noteEventCount: "Note events",
  macroEventCount: "Macro events",
  outputAbsSum: "Output abs sum"
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

export const compareBenchmarkSuites = (
  base: AudioBenchmarkSuiteResult | null,
  head: AudioBenchmarkSuiteResult
): AudioBenchmarkComparison => {
  const deltas = {} as AudioBenchmarkComparison["deltas"];
  (Object.keys(head.summaries) as Array<keyof AudioBenchmarkMetricSummaries>).forEach((key) => {
    const baseMean = base?.summaries[key]?.mean;
    const headMean = head.summaries[key].mean;
    deltas[key] = {
      absolute: typeof baseMean === "number" ? headMean - baseMean : null,
      percent: typeof baseMean === "number" && Math.abs(baseMean) > 1e-9 ? ((headMean - baseMean) / baseMean) * 100 : null
    };
  });

  return { base, head, deltas };
};

const format = (value: number) => value.toFixed(Math.abs(value) >= 100 ? 1 : 2);
const formatOptional = (value: number | null | undefined) => (typeof value === "number" ? format(value) : "not available");
const formatPercent = (value: number | null) => (value === null ? "not available" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`);

const deltaEmoji = (key: keyof AudioBenchmarkMetricSummaries, delta: number | null) => {
  if (delta === null) {
    return "not available";
  }
  if (Math.abs(delta) < 1e-9) {
    return "-";
  }
  const improved = lowerIsBetter.has(key) ? delta < 0 : delta > 0;
  return improved ? "better" : "worse";
};

export const renderBenchmarkComparisonMarkdown = (comparison: AudioBenchmarkComparison): string => {
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

  const rows = keys
    .map((key) => {
      const baseSummary = base?.summaries[key];
      const headSummary = head.summaries[key];
      const delta = deltas[key];
      return `| ${metricLabel[key]} | ${formatOptional(baseSummary?.mean)} | ${format(headSummary.mean)} | ${formatOptional(delta.absolute)} | ${formatPercent(delta.percent)} | ${deltaEmoji(key, delta.absolute)} |`;
    })
    .join("\n");

  return [
    `Scenario: \`${head.scenario.id}\``,
    "",
    `- Runs: ${head.runsRequested} measured, ${head.warmupRuns} warmup`,
    `- Song: ${head.scenario.durationBeats} beats at ${head.scenario.tempo} BPM`,
    `- Tracks: ${head.scenario.trackCount} total, ${head.scenario.automatedTrackCount} with automation`,
    `- System: ${head.system.platform} ${head.system.arch}, Node ${head.system.node}`,
    ...(base ? [] : ["- Base benchmark: not available on the PR base branch"]),
    "",
    `| Metric | Base (${base ? (base.gitRef ?? "base") : "not available"}) | Head (${head.gitRef ?? "head"}) | Abs delta | % delta | Direction |`,
    "| --- | ---: | ---: | ---: | ---: | --- |",
    rows
  ].join("\n");
};
