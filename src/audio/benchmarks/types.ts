import { AudioProject } from "@/types/audio";

export interface AudioBenchmarkScenarioConfig {
  id: string;
  name: string;
  durationBeats: number;
  tempo: number;
  meter: "4/4" | "3/4";
  gridBeats: number;
  trackCount: number;
  automatedTrackCount: number;
  macroAutomationLanesPerTrack: number;
  includeVolumeAutomationOnAutomatedTracks: boolean;
  noteSpacingBeats: number;
  noteDurationBeats: number;
  blockSize: number;
  sampleRate: 48000;
}

export interface AudioBenchmarkScenario {
  config: AudioBenchmarkScenarioConfig;
  project: AudioProject;
}

export interface AudioBenchmarkRunMetrics {
  compileProjectMs: number;
  scheduleEventsMs: number;
  transportSetupMs: number;
  renderSongMs: number;
  realtimeFactor: number;
  eventsPerSecond: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaMb: number;
  heapUsedDeltaMb: number;
  peakHeapMb: number;
  renderedBlocks: number;
  renderedSamples: number;
  eventCount: number;
  noteEventCount: number;
  macroEventCount: number;
  outputAbsSum: number;
}

export interface AudioBenchmarkRunResult {
  index: number;
  metrics: AudioBenchmarkRunMetrics;
}

export interface NumericMetricSummary {
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number;
}

export interface AudioBenchmarkMetricSummaries {
  compileProjectMs: NumericMetricSummary;
  scheduleEventsMs: NumericMetricSummary;
  transportSetupMs: NumericMetricSummary;
  renderSongMs: NumericMetricSummary;
  realtimeFactor: NumericMetricSummary;
  eventsPerSecond: NumericMetricSummary;
  cpuUserMs: NumericMetricSummary;
  cpuSystemMs: NumericMetricSummary;
  rssDeltaMb: NumericMetricSummary;
  heapUsedDeltaMb: NumericMetricSummary;
  peakHeapMb: NumericMetricSummary;
  renderedBlocks: NumericMetricSummary;
  renderedSamples: NumericMetricSummary;
  eventCount: NumericMetricSummary;
  noteEventCount: NumericMetricSummary;
  macroEventCount: NumericMetricSummary;
  outputAbsSum: NumericMetricSummary;
}

export interface AudioBenchmarkSuiteResult {
  schemaVersion: 1;
  generatedAt: string;
  gitRef?: string;
  gitSha?: string;
  system: {
    node: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  scenario: AudioBenchmarkScenarioConfig;
  runsRequested: number;
  warmupRuns: number;
  summaries: AudioBenchmarkMetricSummaries;
  runs: AudioBenchmarkRunResult[];
}

export interface AudioBenchmarkComparison {
  base: AudioBenchmarkSuiteResult | null;
  head: AudioBenchmarkSuiteResult;
  deltas: Record<keyof AudioBenchmarkMetricSummaries, {
    absolute: number | null;
    percent: number | null;
  }>;
}
