import { clamp } from "@/lib/numeric";
import { normalizeProbeSamples, PROBE_MAX_MAX_FREQUENCY_HZ, resolveProbePeakAmplitude } from "@/lib/patch/probes";
import { PreviewProbeCapture } from "@/types/probes";

const SPECTRUM_REFERENCE_FREQUENCIES = [100, 200, 500, 1000, 2000, 5000, 10000, 20000];

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

export function buildScopeRenderData(capture: PreviewProbeCapture | undefined, compact = false): ScopeRenderData {
  const durationSamples = capture?.durationSamples ?? 0;
  const capturedSamples = capture?.capturedSamples ?? 0;
  const sampleRate = capture?.sampleRate ?? 48000;
  if (!capture?.samples?.length || durationSamples <= 0) {
    return {
      waveformSegments: [],
      envelopeLine: "",
      peak: 0,
      capturedRatio: 0,
      durationSeconds: 0
    };
  }

  const visibleSamples = capture.samples.slice(0, capturedSamples);
  const normalized = normalizeProbeSamples(visibleSamples);
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
    const bucketStart = Math.floor((bucket / bucketCount) * durationSamples);
    const bucketEnd = Math.max(bucketStart + 1, Math.floor(((bucket + 1) / bucketCount) * durationSamples));
    const x = plotStartX + (bucket / Math.max(1, bucketCount - 1)) * plotWidth;
    if (bucketStart >= capturedSamples) {
      continue;
    }
    const normalizedStart = Math.floor((bucketStart / Math.max(1, capturedSamples)) * normalized.length);
    const normalizedEnd = Math.max(
      normalizedStart + 1,
      Math.floor((Math.min(bucketEnd, capturedSamples) / Math.max(1, capturedSamples)) * normalized.length)
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
    capturedRatio: capturedSamples / Math.max(1, durationSamples),
    durationSeconds: durationSamples / Math.max(1, sampleRate)
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
  const candidates = limitedCandidates.length > 0 ? limitedCandidates : [Math.max(100, Math.round(maxFrequencyHz * 0.5))];
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
