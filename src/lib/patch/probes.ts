import { createId } from "@/lib/ids";
import { clamp } from "@/lib/numeric";
import { PatchProbeFrequencyView, PatchWorkspaceProbeState } from "@/types/probes";

export const DEFAULT_SCOPE_PROBE_SIZE = { width: 10, height: 6 } as const;
export const DEFAULT_SPECTRUM_PROBE_SIZE = { width: 10, height: 6 } as const;
export const EXPANDED_PROBE_SIZE = { width: 340, height: 228 } as const;
export const PROBE_MIN_MAX_FREQUENCY_HZ = 500;
export const PROBE_MAX_MAX_FREQUENCY_HZ = 24000;
export const DEFAULT_PROBE_MAX_FREQUENCY_HZ = PROBE_MAX_MAX_FREQUENCY_HZ;
export const DEFAULT_PROBE_FREQUENCY_VIEW: PatchProbeFrequencyView = {
  maxHz: DEFAULT_PROBE_MAX_FREQUENCY_HZ
};
const MIN_PROBE_NORMALIZATION_PEAK = 0.0001;
const SPECTRUM_FRAME_GRID_MIN_FRAME_SIZE = 8;
const SPECTROGRAM_MIN_FRAME_SIZE = 96;
const SPECTROGRAM_MIN_TIMELINE_SECONDS = 1;

export interface ProbeSpectrogramTimeline {
  durationSamples: number;
  capturedSamples: number;
  capturedRatio: number;
}

export interface ProbeSpectrumFrameGrid {
  columns: number[][];
  frameSize: number;
  peak: number;
}

export const createPatchWorkspaceProbe = (
  kind: PatchWorkspaceProbeState["kind"],
  x: number,
  y: number
): PatchWorkspaceProbeState => ({
  id: createId("probe"),
  kind,
  name: kind === "spectrum" ? "Spectrum Probe" : kind === "pitch_tracker" ? "Pitch Tracker" : "Scope Probe",
  x,
  y,
  width: kind === "spectrum" ? DEFAULT_SPECTRUM_PROBE_SIZE.width : DEFAULT_SCOPE_PROBE_SIZE.width,
  height: kind === "spectrum" ? DEFAULT_SPECTRUM_PROBE_SIZE.height : DEFAULT_SCOPE_PROBE_SIZE.height,
  expanded: false,
  spectrumWindowSize: kind === "spectrum" ? 1024 : undefined,
  frequencyView: kind === "spectrum" ? { ...DEFAULT_PROBE_FREQUENCY_VIEW } : undefined
});

export const clampProbeMaxFrequencyHz = (frequency: number) =>
  clamp(Math.round(frequency), PROBE_MIN_MAX_FREQUENCY_HZ, PROBE_MAX_MAX_FREQUENCY_HZ);

export const resolveProbeFrequencyView = (frequencyView?: PatchProbeFrequencyView): PatchProbeFrequencyView => ({
  maxHz: clampProbeMaxFrequencyHz(frequencyView?.maxHz ?? DEFAULT_PROBE_MAX_FREQUENCY_HZ)
});

export const resolveProbePeakAmplitude = (samples: ArrayLike<number>) => {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    peak = Math.max(peak, Math.abs(Number(samples[index] ?? 0)));
  }
  return Math.max(peak, MIN_PROBE_NORMALIZATION_PEAK);
};

export const normalizeProbeSamples = (samples: ArrayLike<number>) => {
  const peak = resolveProbePeakAmplitude(samples);
  return Array.from({ length: samples.length }, (_, index) => Number(samples[index] ?? 0) / peak);
};

export const resolveProbeCaptureWindow = (
  samples: ArrayLike<number>,
  durationSamples: number,
  capturedSamples: number,
  progress: number,
  requestedWindowSize: number
) => {
  const safeCapturedSamples = clamp(
    capturedSamples || samples.length,
    0,
    Math.min(samples.length, durationSamples || samples.length)
  );
  if (safeCapturedSamples <= 0) {
    return [];
  }
  const frameSize = clamp(requestedWindowSize, 32, safeCapturedSamples);
  const progressIndex = clamp(Math.floor(progress * Math.max(0, durationSamples - 1)), 0, safeCapturedSamples - 1);
  const windowEnd = clamp(progressIndex + 1, frameSize, safeCapturedSamples);
  const windowStart = Math.max(0, windowEnd - frameSize);
  return Array.from({ length: windowEnd - windowStart }, (_, index) => Number(samples[windowStart + index] ?? 0));
};

export const buildSpectrumBins = (
  samples: ArrayLike<number>,
  windowSize = 1024,
  binCount = 32,
  progress = 1,
  durationSamples = samples.length,
  capturedSamples = samples.length
) => {
  const activeWindow = resolveProbeCaptureWindow(samples, durationSamples, capturedSamples, progress, windowSize);
  const frameSize = clamp(windowSize, 32, activeWindow.length);
  if (frameSize < 32) {
    return new Array(binCount).fill(0);
  }
  const windowed = new Float32Array(frameSize);
  const peak = resolveProbePeakAmplitude(activeWindow);
  for (let index = 0; index < frameSize; index += 1) {
    const source = Number(activeWindow[index] ?? 0) / peak;
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, frameSize - 1));
    windowed[index] = source * hann;
  }

  const magnitudes = new Array(binCount).fill(0);
  const maxK = Math.max(binCount, Math.floor(frameSize / 2));
  for (let bin = 0; bin < binCount; bin += 1) {
    const low = Math.floor(Math.pow(bin / binCount, 2) * maxK);
    const high = Math.max(low + 1, Math.floor(Math.pow((bin + 1) / binCount, 2) * maxK));
    let energy = 0;
    let count = 0;
    for (let k = low; k < high; k += 1) {
      let real = 0;
      let imag = 0;
      for (let sampleIndex = 0; sampleIndex < frameSize; sampleIndex += 1) {
        const phase = (2 * Math.PI * k * sampleIndex) / frameSize;
        real += windowed[sampleIndex] * Math.cos(phase);
        imag -= windowed[sampleIndex] * Math.sin(phase);
      }
      energy += Math.sqrt(real * real + imag * imag) / frameSize;
      count += 1;
    }
    magnitudes[bin] = count > 0 ? Math.min(1, (energy / count) * 8) : 0;
  }
  return magnitudes;
};

export const buildProbeSpectrogram = (
  samples: ArrayLike<number>,
  windowSize = 1024,
  timeBinCount = 40,
  freqBinCount = 24,
  durationSamples = samples.length,
  capturedSamples = samples.length,
  sampleRate = 48000,
  maxFrequencyHz = DEFAULT_PROBE_MAX_FREQUENCY_HZ
) => {
  const timeline = resolveProbeSpectrogramTimeline(samples, durationSamples, capturedSamples, sampleRate);
  const safeDurationSamples = timeline.durationSamples;
  const safeCapturedSamples = timeline.capturedSamples;
  const grid = Array.from({ length: freqBinCount }, () => new Array(timeBinCount).fill(0));
  if (safeCapturedSamples < SPECTROGRAM_MIN_FRAME_SIZE) {
    return grid;
  }

  const frameSize = Math.max(SPECTROGRAM_MIN_FRAME_SIZE, Math.min(windowSize, safeCapturedSamples, 384));
  const nyquistHz = Math.max(1, sampleRate / 2);
  const clampedMaxFrequencyHz = Math.min(clampProbeMaxFrequencyHz(maxFrequencyHz), nyquistHz);
  const maxBin = Math.max(2, Math.floor((clampedMaxFrequencyHz / sampleRate) * frameSize));
  const bandCenters = Array.from({ length: freqBinCount }, (_, index) =>
    Math.max(1, Math.floor(Math.pow((index + 0.5) / freqBinCount, 2) * maxBin))
  );
  const hannWindow = Float32Array.from(
    { length: frameSize },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, frameSize - 1))
  );
  let peakMagnitude = 0;

  for (let timeIndex = 0; timeIndex < timeBinCount; timeIndex += 1) {
    const normalizedTime = timeBinCount <= 1 ? 0 : timeIndex / (timeBinCount - 1);
    const centerSample = Math.floor(normalizedTime * Math.max(0, safeDurationSamples - 1));
    if (centerSample >= safeCapturedSamples) {
      continue;
    }
    const frameStart = clamp(centerSample - Math.floor(frameSize / 2), 0, safeCapturedSamples - frameSize);
    const peak = resolveProbeFramePeak(samples, frameStart, frameSize);
    for (let freqIndex = 0; freqIndex < freqBinCount; freqIndex += 1) {
      const magnitude = measureGoertzelMagnitude(
        samples,
        frameStart,
        frameSize,
        bandCenters[freqIndex],
        peak,
        hannWindow
      );
      grid[freqIndex][timeIndex] = magnitude;
      peakMagnitude = Math.max(peakMagnitude, magnitude);
    }
  }

  if (peakMagnitude <= 0) {
    return grid;
  }

  for (let freqIndex = 0; freqIndex < freqBinCount; freqIndex += 1) {
    for (let timeIndex = 0; timeIndex < timeBinCount; timeIndex += 1) {
      const normalizedMagnitude = grid[freqIndex][timeIndex] / peakMagnitude;
      grid[freqIndex][timeIndex] = clamp(Math.pow(normalizedMagnitude, 0.48), 0.02, 1);
    }
  }

  return grid;
};

export const buildProbeSpectrumColumn = (
  samples: ArrayLike<number>,
  windowSize = 1024,
  freqBinCount = 24,
  capturedSamples = samples.length,
  sampleRate = 48000,
  maxFrequencyHz = DEFAULT_PROBE_MAX_FREQUENCY_HZ,
  normalize = true
) => {
  const safeCapturedSamples = clamp(capturedSamples, 0, samples.length);
  const magnitudes = new Array(freqBinCount).fill(0);
  if (safeCapturedSamples < SPECTROGRAM_MIN_FRAME_SIZE) {
    return magnitudes;
  }

  const frameSize = Math.max(SPECTROGRAM_MIN_FRAME_SIZE, Math.min(windowSize, safeCapturedSamples, 384));
  const frameStart = clamp(safeCapturedSamples - frameSize, 0, safeCapturedSamples - frameSize);
  const nyquistHz = Math.max(1, sampleRate / 2);
  const clampedMaxFrequencyHz = Math.min(clampProbeMaxFrequencyHz(maxFrequencyHz), nyquistHz);
  const maxBin = Math.max(2, Math.floor((clampedMaxFrequencyHz / sampleRate) * frameSize));
  const bandCenters = Array.from({ length: freqBinCount }, (_, index) =>
    Math.max(1, Math.floor(Math.pow((index + 0.5) / freqBinCount, 2) * maxBin))
  );
  const hannWindow = Float32Array.from(
    { length: frameSize },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, frameSize - 1))
  );
  const peak = normalize ? resolveProbeFramePeak(samples, frameStart, frameSize) : 1;
  let peakMagnitude = 0;
  for (let freqIndex = 0; freqIndex < freqBinCount; freqIndex += 1) {
    const magnitude = measureGoertzelMagnitude(
      samples,
      frameStart,
      frameSize,
      bandCenters[freqIndex],
      peak,
      hannWindow
    );
    magnitudes[freqIndex] = magnitude;
    peakMagnitude = Math.max(peakMagnitude, magnitude);
  }
  if (peakMagnitude <= 0) {
    return magnitudes;
  }
  if (!normalize) {
    return magnitudes;
  }
  return magnitudes.map((magnitude) => clamp(Math.pow(magnitude / peakMagnitude, 0.48), 0.02, 1));
};

export const buildProbeSpectrumFrameGrid = (
  samples: ArrayLike<number>,
  windowSize = 1024,
  freqBinCount = 24,
  capturedSamples = samples.length,
  sampleRate = 48000,
  maxFrequencyHz = DEFAULT_PROBE_MAX_FREQUENCY_HZ
): ProbeSpectrumFrameGrid => {
  const safeCapturedSamples = clamp(capturedSamples, 0, samples.length);
  const frameSize = Math.max(SPECTRUM_FRAME_GRID_MIN_FRAME_SIZE, Math.round(windowSize));
  const columns: number[][] = [];
  if (safeCapturedSamples < frameSize) {
    return { columns, frameSize, peak: 0 };
  }

  const nyquistHz = Math.max(1, sampleRate / 2);
  const clampedMaxFrequencyHz = Math.min(clampProbeMaxFrequencyHz(maxFrequencyHz), nyquistHz);
  const maxBin = Math.max(2, Math.floor((clampedMaxFrequencyHz / sampleRate) * frameSize));
  const bandCenters = Array.from({ length: freqBinCount }, (_, index) =>
    Math.max(1, Math.floor(Math.pow((index + 0.5) / freqBinCount, 2) * maxBin))
  );
  const hannWindow = Float32Array.from(
    { length: frameSize },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, frameSize - 1))
  );
  let peak = 0;

  for (let frameStart = 0; frameStart + frameSize <= safeCapturedSamples; frameStart += frameSize) {
    const column = new Array(freqBinCount).fill(0);
    for (let freqIndex = 0; freqIndex < freqBinCount; freqIndex += 1) {
      const magnitude = measureGoertzelMagnitude(samples, frameStart, frameSize, bandCenters[freqIndex], 1, hannWindow);
      column[freqIndex] = magnitude;
      peak = Math.max(peak, magnitude);
    }
    columns.push(column);
  }

  return { columns, frameSize, peak };
};

export const resolveProbeSpectrumCaptureFrameSize = (sourceWindowSize = 1024, sampleStride = 1) =>
  Math.max(SPECTRUM_FRAME_GRID_MIN_FRAME_SIZE, Math.round(sourceWindowSize / Math.max(1, sampleStride)));

export const resolveProbeSpectrogramTimeline = (
  samples: ArrayLike<number>,
  durationSamples = samples.length,
  capturedSamples = samples.length,
  sampleRate = 48000
): ProbeSpectrogramTimeline => {
  const minimumTimelineSamples = Math.max(1, Math.round(sampleRate * SPECTROGRAM_MIN_TIMELINE_SECONDS));
  const requestedDurationSamples = Math.max(durationSamples, 1);
  const boundedCapturedSamples = clamp(capturedSamples, 0, Math.min(samples.length, requestedDurationSamples));
  const safeDurationSamples = Math.max(boundedCapturedSamples, minimumTimelineSamples, 1);
  return {
    durationSamples: safeDurationSamples,
    capturedSamples: boundedCapturedSamples,
    capturedRatio: boundedCapturedSamples / safeDurationSamples
  };
};

function resolveProbeFramePeak(samples: ArrayLike<number>, frameStart: number, frameSize: number) {
  let peak = 0;
  for (let index = 0; index < frameSize; index += 1) {
    peak = Math.max(peak, Math.abs(Number(samples[frameStart + index] ?? 0)));
  }
  return Math.max(peak, MIN_PROBE_NORMALIZATION_PEAK);
}

function measureGoertzelMagnitude(
  samples: ArrayLike<number>,
  frameStart: number,
  frameSize: number,
  binIndex: number,
  peak: number,
  hannWindow: Float32Array
) {
  const omega = (2 * Math.PI * binIndex) / frameSize;
  const coefficient = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let index = 0; index < frameSize; index += 1) {
    const normalizedSample = Number(samples[frameStart + index] ?? 0) / peak;
    q0 = coefficient * q1 - q2 + normalizedSample * hannWindow[index];
    q2 = q1;
    q1 = q0;
  }

  const real = q1 - q2 * Math.cos(omega);
  const imag = q2 * Math.sin(omega);
  return Math.sqrt(real * real + imag * imag) / frameSize;
}
