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

export interface ScopeAdsrEstimate {
  attackSeconds: number;
  decaySeconds: number;
  sustainRatio: number;
  releaseSeconds: number;
  label: string;
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
  const waveformCenterY = compact ? 18 : 15;
  const waveformHalfHeight = compact ? 10 : 11;
  const envelopeTopY = compact ? 35 : 31;
  const envelopeHeight = compact ? 18 : 23;
  const plotStartX = compact ? 2 : 6;
  const plotWidth = compact ? 97 : 92;

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
  const plotStartX = compact ? 2 : 6;
  const plotWidth = compact ? 97 : 92;
  return [0, 0.5, 1].map((ratio) => ({
    ratio,
    x: plotStartX + ratio * plotWidth,
    label: formatScopeTimestamp(durationSeconds * ratio)
  }));
}

export function estimateScopeAdsrEnvelope(
  capture: PreviewProbeCapture | undefined,
  compact = false
): ScopeAdsrEstimate | null {
  if (compact || !capture?.captureComplete || !capture.samples?.length) {
    return null;
  }
  const durationSamples = Math.max(0, capture.durationSamples || capture.samples.length);
  const capturedSamples = clamp(capture.capturedSamples || capture.samples.length, 0, capture.samples.length);
  if (capturedSamples <= 0 || capturedSamples < Math.min(durationSamples, capture.samples.length) * 0.98) {
    return null;
  }

  const sampleRate = Math.max(1, capture.sampleRate || 48000);
  const bucketCount = clamp(Math.floor(capturedSamples / 128), 32, 384);
  const envelope = Array.from({ length: bucketCount }, (_, bucket) => {
    const start = Math.floor((bucket / bucketCount) * capturedSamples);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) / bucketCount) * capturedSamples));
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(Number(capture.samples[index] ?? 0)));
    }
    return peak;
  });
  const peak = envelope.reduce((max, value) => Math.max(max, value), 0);
  if (peak <= 0.0005) {
    return null;
  }

  const onsetThreshold = peak * 0.05;
  const attackThreshold = peak * 0.9;
  const releaseThreshold = peak * 0.06;
  const onsetBucket = envelope.findIndex((value) => value >= onsetThreshold);
  const attackBucket = envelope.findIndex(
    (value, index) => index >= Math.max(0, onsetBucket) && value >= attackThreshold
  );
  const releaseEndBucket = findLastIndex(envelope, (value) => value >= releaseThreshold);
  if (onsetBucket < 0 || attackBucket < 0 || releaseEndBucket <= attackBucket) {
    return null;
  }

  const sustainWindowStart = clamp(Math.floor(bucketCount * 0.58), attackBucket, bucketCount - 1);
  const sustainWindowEnd = clamp(Math.floor(bucketCount * 0.85), sustainWindowStart + 1, bucketCount);
  const sustainValues = envelope.slice(sustainWindowStart, sustainWindowEnd).sort((left, right) => left - right);
  const sustain = sustainValues.length ? sustainValues[Math.floor(sustainValues.length / 2)] : peak * 0.5;
  const sustainRatio = clamp(sustain / peak, 0, 1);
  const decayThreshold = sustain + (peak - sustain) * 0.1;
  const resolvedDecayBucket = envelope.findIndex((value, index) => index > attackBucket && value <= decayThreshold);
  const decayBucket = resolvedDecayBucket >= 0 ? resolvedDecayBucket : sustainWindowStart;
  const releaseStartThreshold = Math.max(sustain + (peak - sustain) * 0.1, peak * 0.06);
  let releaseStartBucket = attackBucket;
  for (let index = releaseEndBucket; index > attackBucket; index -= 1) {
    if ((envelope[index] ?? 0) >= releaseStartThreshold) {
      releaseStartBucket = index;
      break;
    }
  }

  const secondsPerBucket = capturedSamples / bucketCount / sampleRate;
  const attackSeconds = Math.max(0, (attackBucket - onsetBucket) * secondsPerBucket);
  const decaySeconds = Math.max(0, (decayBucket - attackBucket) * secondsPerBucket);
  const releaseSeconds = Math.max(0, (releaseEndBucket - releaseStartBucket) * secondsPerBucket);

  return {
    attackSeconds,
    decaySeconds,
    sustainRatio,
    releaseSeconds,
    label: `A: ${formatAdsrDuration(attackSeconds)}|D:${formatAdsrDuration(decaySeconds)}|S:${Math.round(
      sustainRatio * 100
    )}%|R:${formatAdsrDuration(releaseSeconds)}`
  };
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

function formatAdsrDuration(seconds: number) {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
}

function findLastIndex<T>(values: T[], predicate: (value: T, index: number) => boolean) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index], index)) {
      return index;
    }
  }
  return -1;
}
