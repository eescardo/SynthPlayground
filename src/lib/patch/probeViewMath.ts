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
  waveformRegionPath: string;
  envelopeRegionPath: string;
  usesFinalScope: boolean;
  peak: number;
  capturedRatio: number;
  durationSeconds: number;
}

export interface ScopeGraphLayout {
  plotStartX: number;
  plotWidth: number;
  waveformTopY: number;
  waveformCenterY: number;
  waveformBottomY: number;
  waveformHalfHeight: number;
  envelopeTopY: number;
  envelopeBottomY: number;
  envelopeHeight: number;
  waveformBufferY: number;
  envelopeBufferY: number;
}

export interface SpectrumFrequencyMarker {
  frequency: number;
  bottomPercent: number;
}

export function resolveScopeGraphLayout(compact = false): ScopeGraphLayout {
  return {
    plotStartX: compact ? 0 : 6,
    plotWidth: compact ? 100 : 92,
    waveformTopY: compact ? 6 : 2,
    waveformCenterY: compact ? 17 : 15,
    waveformBottomY: compact ? 28 : 28,
    waveformHalfHeight: compact ? 10 : 11,
    envelopeTopY: compact ? 33 : 31,
    envelopeBottomY: compact ? 54 : 56,
    envelopeHeight: compact ? 21 : 25,
    waveformBufferY: compact ? 1.3 : 1.7,
    envelopeBufferY: compact ? 0.9 : 1.2
  };
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
  if (capture?.finalScope?.waveformBuckets?.length) {
    return buildFinalScopeRenderData(capture, compact);
  }

  const durationSamples = Math.max(0, capture?.durationSamples ?? 0);
  const capturedSamples = Math.max(0, capture?.capturedSamples ?? 0);
  const sampleRate = capture?.sampleRate ?? 48000;
  if (!capture?.samples?.length) {
    return {
      waveformSegments: [],
      envelopeLine: "",
      waveformRegionPath: "",
      envelopeRegionPath: "",
      usesFinalScope: false,
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
      waveformRegionPath: "",
      envelopeRegionPath: "",
      usesFinalScope: false,
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
  const layout = resolveScopeGraphLayout(compact);

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketStart = Math.floor((bucket / bucketCount) * displaySampleCount);
    const bucketEnd = Math.max(bucketStart + 1, Math.floor(((bucket + 1) / bucketCount) * displaySampleCount));
    const x = layout.plotStartX + (bucket / Math.max(1, bucketCount - 1)) * layout.plotWidth;
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
      y1: layout.waveformCenterY - max * layout.waveformHalfHeight,
      y2: layout.waveformCenterY - min * layout.waveformHalfHeight
    });
    envelopePoints.push(`${x},${layout.envelopeTopY + (1 - absolutePeak) * layout.envelopeHeight}`);
  }

  return {
    waveformSegments,
    envelopeLine: envelopePoints.join(" "),
    waveformRegionPath: "",
    envelopeRegionPath: "",
    usesFinalScope: false,
    peak: resolveProbePeakAmplitude(visibleSamples),
    capturedRatio: renderSampleCount / displaySampleCount,
    durationSeconds: displaySampleCount / Math.max(1, sampleRate)
  };
}

function buildFinalScopeRenderData(capture: PreviewProbeCapture, compact: boolean): ScopeRenderData {
  const finalScope = capture.finalScope;
  if (!finalScope?.waveformBuckets?.length) {
    return {
      waveformSegments: [],
      envelopeLine: "",
      waveformRegionPath: "",
      envelopeRegionPath: "",
      usesFinalScope: false,
      peak: 0,
      capturedRatio: 0,
      durationSeconds: 0
    };
  }

  const sourceBuckets = finalScope.waveformBuckets;
  const sampleRate = finalScope.sampleRate || capture.sampleRate || 48000;
  const capturedSamples = Math.max(0, finalScope.capturedSamples || capture.sourceCapturedSamples || 0);
  const displaySampleCount = Math.max(capturedSamples, Math.round(sampleRate * SCOPE_MIN_TIMELINE_SECONDS), 1);
  const capturedRatio = clamp(capturedSamples / displaySampleCount, 0, 1);
  const targetBucketCount = compact ? Math.min(192, sourceBuckets.length) : sourceBuckets.length;
  const displayBucketCount = Math.max(
    1,
    Math.round(targetBucketCount / Math.max(capturedRatio, 1 / targetBucketCount))
  );
  const waveformSegments: ScopeWaveformSegment[] = [];
  const envelopePoints: string[] = [];
  const waveformRegionTopPoints: string[] = [];
  const waveformRegionBottomPoints: string[] = [];
  const envelopeRegionTopPoints: string[] = [];
  const envelopeRegionBottomPoints: string[] = [];
  const peak = Math.max(0, finalScope.peak || 0);
  const safePeak = peak > 0 ? peak : 1;
  const layout = resolveScopeGraphLayout(compact);

  for (let bucket = 0; bucket < targetBucketCount; bucket += 1) {
    const sourceStart = Math.floor((bucket / targetBucketCount) * sourceBuckets.length);
    const sourceEnd = Math.max(sourceStart + 1, Math.floor(((bucket + 1) / targetBucketCount) * sourceBuckets.length));
    const x = layout.plotStartX + (bucket / Math.max(1, displayBucketCount - 1)) * layout.plotWidth;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let absolutePeak = 0;

    for (let index = sourceStart; index < sourceEnd; index += 1) {
      const sourceBucket = sourceBuckets[index];
      if (!sourceBucket) {
        continue;
      }
      min = Math.min(min, sourceBucket.min / safePeak);
      max = Math.max(max, sourceBucket.max / safePeak);
      absolutePeak = Math.max(
        absolutePeak,
        sourceBucket.peak / safePeak,
        (finalScope.envelopeBuckets[index] ?? 0) / safePeak
      );
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      continue;
    }
    waveformSegments.push({
      x,
      y1: layout.waveformCenterY - clamp(max, -1, 1) * layout.waveformHalfHeight,
      y2: layout.waveformCenterY - clamp(min, -1, 1) * layout.waveformHalfHeight
    });
    const envelopeRatio = clamp(absolutePeak, 0, 1);
    const envelopeY = layout.envelopeTopY + (1 - envelopeRatio) * layout.envelopeHeight;
    envelopePoints.push(`${x},${envelopeY}`);
    waveformRegionTopPoints.push(
      `${x},${clamp(
        layout.waveformCenterY - envelopeRatio * layout.waveformHalfHeight - layout.waveformBufferY,
        layout.waveformTopY,
        layout.waveformBottomY
      )}`
    );
    waveformRegionBottomPoints.push(
      `${x},${clamp(
        layout.waveformCenterY + envelopeRatio * layout.waveformHalfHeight + layout.waveformBufferY,
        layout.waveformTopY,
        layout.waveformBottomY
      )}`
    );
    envelopeRegionTopPoints.push(
      `${x},${clamp(envelopeY - layout.envelopeBufferY, layout.envelopeTopY, layout.envelopeBottomY)}`
    );
    envelopeRegionBottomPoints.push(`${x},${layout.envelopeBottomY}`);
  }

  const waveformRegionPath =
    waveformRegionTopPoints.length > 0
      ? `M ${waveformRegionTopPoints.join(" L ")} L ${waveformRegionBottomPoints.reverse().join(" L ")} Z`
      : "";
  const envelopeRegionPath =
    envelopeRegionTopPoints.length > 0
      ? `M ${envelopeRegionTopPoints.join(" L ")} L ${envelopeRegionBottomPoints.reverse().join(" L ")} Z`
      : "";

  return {
    waveformSegments,
    envelopeLine: envelopePoints.join(" "),
    waveformRegionPath,
    envelopeRegionPath,
    usesFinalScope: true,
    peak,
    capturedRatio,
    durationSeconds: displaySampleCount / Math.max(1, sampleRate)
  };
}

export function resolveScopeTimeMarkers(durationSeconds: number, compact = false) {
  const layout = resolveScopeGraphLayout(compact);
  return [0, 0.5, 1].map((ratio) => ({
    ratio,
    x: layout.plotStartX + ratio * layout.plotWidth,
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
