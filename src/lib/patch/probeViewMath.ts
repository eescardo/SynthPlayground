import { clamp } from "@/lib/numeric";
import { normalizeProbeSamples, PROBE_MAX_MAX_FREQUENCY_HZ, resolveProbePeakAmplitude } from "@/lib/patch/probes";
import { PreviewProbeCapture } from "@/types/probes";

const SPECTRUM_REFERENCE_FREQUENCIES = [100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const SCOPE_MIN_TIMELINE_SECONDS = 1;

export interface ScopeWaveformSegment {
  x: number;
  y1: number;
  y2: number;
}

export interface ScopeRenderData {
  waveformSegments: ScopeWaveformSegment[];
  envelopeLine: string;
  peak: number;
  capturedRatio: number;
  durationSeconds: number;
}

export interface SpectrumFrequencyMarker {
  frequency: number;
  bottomPercent: number;
}

export function resolveSpectrumTimelineFillRatio(capturedSamples: number, sampleRate: number, viewportSeconds: number) {
  const viewportSamples = Math.max(1, Math.round(Math.max(0, viewportSeconds) * Math.max(1, sampleRate)));
  return clamp(Math.max(0, capturedSamples) / viewportSamples, 0, 1);
}

export function resolveSpectrumTimelineFrameIndex(
  displayRatio: number,
  filledRatio: number,
  visibleFrameCount: number
) {
  const safeFilledRatio = clamp(filledRatio, 0, 1);
  if (visibleFrameCount <= 0 || safeFilledRatio <= 0 || displayRatio > safeFilledRatio) {
    return -1;
  }
  const sourceRatio = clamp(displayRatio, 0, 1) / safeFilledRatio;
  return clamp(Math.floor(sourceRatio * visibleFrameCount), 0, visibleFrameCount - 1);
}

export function buildScopeRenderData(capture: PreviewProbeCapture | undefined, compact = false): ScopeRenderData {
  const durationSamples = Math.max(0, capture?.durationSamples ?? 0);
  const capturedSamples = Math.max(0, capture?.capturedSamples ?? 0);
  const sampleRate = capture?.sampleRate ?? 48000;
  if (!capture?.samples?.length) {
    return {
      waveformSegments: [],
      envelopeLine: "",
      peak: 0,
      capturedRatio: 0,
      durationSeconds: 0
    };
  }

  const safeCapturedSamples = clamp(
    capturedSamples || capture.samples.length,
    0,
    Math.min(capture.samples.length, durationSamples || capture.samples.length)
  );
  const visibleSamples = Array.from({ length: safeCapturedSamples }, (_, index) => Number(capture.samples[index] ?? 0));
  if (visibleSamples.length <= 0) {
    return {
      waveformSegments: [],
      envelopeLine: "",
      peak: 0,
      capturedRatio: 0,
      durationSeconds: 0
    };
  }

  const normalized = normalizeProbeSamples(visibleSamples);
  const renderSampleCount = Math.max(1, visibleSamples.length);
  const displaySampleCount = Math.max(renderSampleCount, Math.round(sampleRate * SCOPE_MIN_TIMELINE_SECONDS), 1);
  const bucketCount = compact ? 72 : 120;
  const waveformSegments: ScopeWaveformSegment[] = [];
  const envelopePoints: string[] = [];
  const waveformCenterY = compact ? 18 : 17;
  const waveformHalfHeight = compact ? 10 : 9;
  const envelopeTopY = compact ? 35 : 33;
  const envelopeHeight = compact ? 18 : 19;
  const plotStartX = compact ? 2 : 8;
  const plotWidth = compact ? 97 : 90;

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketStart = Math.floor((bucket / bucketCount) * displaySampleCount);
    const bucketEnd = Math.max(bucketStart + 1, Math.floor(((bucket + 1) / bucketCount) * displaySampleCount));
    const x = plotStartX + (bucket / Math.max(1, bucketCount - 1)) * plotWidth;
    if (bucketStart >= renderSampleCount) {
      continue;
    }
    const normalizedStart = Math.floor((bucketStart / renderSampleCount) * normalized.length);
    const normalizedEnd = Math.max(
      normalizedStart + 1,
      Math.floor((Math.min(bucketEnd, renderSampleCount) / renderSampleCount) * normalized.length)
    );
    let min = 1;
    let max = -1;
    let absolutePeak = 0;
    for (let index = normalizedStart; index < normalizedEnd; index += 1) {
      const sample = normalized[index] ?? 0;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
      absolutePeak = Math.max(absolutePeak, Math.abs(sample));
    }
    waveformSegments.push({
      x,
      y1: waveformCenterY - max * waveformHalfHeight,
      y2: waveformCenterY - min * waveformHalfHeight
    });
    envelopePoints.push(`${x},${envelopeTopY + (1 - absolutePeak) * envelopeHeight}`);
  }

  return {
    waveformSegments,
    envelopeLine: envelopePoints.join(" "),
    peak: resolveProbePeakAmplitude(visibleSamples),
    capturedRatio: renderSampleCount / displaySampleCount,
    durationSeconds: displaySampleCount / Math.max(1, sampleRate)
  };
}

export function resolveScopeTimeMarkers(durationSeconds: number, compact = false) {
  const plotStartX = compact ? 2 : 8;
  const plotWidth = compact ? 97 : 90;
  return [0, 0.5, 1].map((ratio) => ({
    ratio,
    x: plotStartX + ratio * plotWidth,
    label: formatScopeTimestamp(durationSeconds * ratio)
  }));
}

export function resolveSpectrumFrequencyMarkers(maxFrequencyHz: number): SpectrumFrequencyMarker[] {
  const limitedCandidates = SPECTRUM_REFERENCE_FREQUENCIES.filter((frequency) => frequency < maxFrequencyHz * 0.98);
  const candidates =
    limitedCandidates.length > 0 ? limitedCandidates : [Math.max(100, Math.round(maxFrequencyHz * 0.5))];
  const targets = [0.18, 0.45, 0.8];
  const selected = new Set<number>();

  for (const target of targets) {
    const desired = maxFrequencyHz * target;
    let bestFrequency = candidates[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (selected.has(candidate)) {
        continue;
      }
      const distance = Math.abs(candidate - desired);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestFrequency = candidate;
      }
    }
    selected.add(bestFrequency);
    if (selected.size === candidates.length) {
      break;
    }
  }

  return [...selected]
    .sort((left, right) => left - right)
    .map((frequency) => ({
      frequency,
      bottomPercent: Math.sqrt(frequency / clamp(maxFrequencyHz, 1, PROBE_MAX_MAX_FREQUENCY_HZ)) * 100
    }));
}

export function formatSpectrumFrequency(frequency: number) {
  if (frequency >= 1000) {
    const khz = frequency / 1000;
    return Number.isInteger(khz) ? `${khz}kHz` : `${khz.toFixed(1)}kHz`;
  }
  return `${frequency}Hz`;
}

export function formatScopeTimestamp(seconds: number) {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
}
