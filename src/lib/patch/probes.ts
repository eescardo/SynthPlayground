import { createId } from "@/lib/ids";
import { PatchWorkspaceProbeState } from "@/types/probes";

export const DEFAULT_SCOPE_PROBE_SIZE = { width: 10, height: 6 } as const;
export const DEFAULT_SPECTRUM_PROBE_SIZE = { width: 10, height: 6 } as const;
export const EXPANDED_PROBE_SIZE = { width: 340, height: 228 } as const;
export const PROBE_MIN_MAX_FREQUENCY_HZ = 500;
export const PROBE_MAX_MAX_FREQUENCY_HZ = 24000;
export const DEFAULT_PROBE_MAX_FREQUENCY_HZ = PROBE_MAX_MAX_FREQUENCY_HZ;
const MIN_PROBE_NORMALIZATION_PEAK = 0.0001;
const SPECTROGRAM_MIN_FRAME_SIZE = 96;

export const createPatchWorkspaceProbe = (
  kind: PatchWorkspaceProbeState["kind"],
  x: number,
  y: number
): PatchWorkspaceProbeState => ({
  id: createId("probe"),
  kind,
  name: kind === "spectrum" ? "Spectrum Probe" : "Scope Probe",
  x,
  y,
  width: kind === "spectrum" ? DEFAULT_SPECTRUM_PROBE_SIZE.width : DEFAULT_SCOPE_PROBE_SIZE.width,
  height: kind === "spectrum" ? DEFAULT_SPECTRUM_PROBE_SIZE.height : DEFAULT_SCOPE_PROBE_SIZE.height,
  expanded: false,
  spectrumWindowSize: kind === "spectrum" ? 1024 : undefined,
  spectrumMaxFrequencyHz: kind === "spectrum" ? DEFAULT_PROBE_MAX_FREQUENCY_HZ : undefined
});

export const clampProbeMaxFrequencyHz = (frequency: number) =>
  Math.max(PROBE_MIN_MAX_FREQUENCY_HZ, Math.min(PROBE_MAX_MAX_FREQUENCY_HZ, Math.round(frequency)));

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
  const safeCapturedSamples = Math.max(0, Math.min(samples.length, capturedSamples || samples.length, durationSamples || samples.length));
  if (safeCapturedSamples <= 0) {
    return [];
  }
  const frameSize = Math.max(32, Math.min(requestedWindowSize, safeCapturedSamples));
  const progressIndex = Math.max(0, Math.min(safeCapturedSamples - 1, Math.floor(progress * Math.max(0, durationSamples - 1))));
  const windowEnd = Math.max(frameSize, Math.min(safeCapturedSamples, progressIndex + 1));
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
  const frameSize = Math.max(32, Math.min(windowSize, activeWindow.length));
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
    magnitudes[bin] = count > 0 ? Math.min(1, energy / count * 8) : 0;
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
  const safeDurationSamples = Math.max(durationSamples, samples.length, 1);
  const safeCapturedSamples = Math.max(0, Math.min(capturedSamples, samples.length, safeDurationSamples));
  const grid = Array.from({ length: freqBinCount }, () => new Array(timeBinCount).fill(0));
  if (safeCapturedSamples < SPECTROGRAM_MIN_FRAME_SIZE) {
    return grid;
  }

  const frameSize = Math.max(
    SPECTROGRAM_MIN_FRAME_SIZE,
    Math.min(windowSize, safeCapturedSamples, 384)
  );
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
    const frameStart = Math.max(0, Math.min(safeCapturedSamples - frameSize, centerSample - Math.floor(frameSize / 2)));
    const peak = resolveProbeFramePeak(samples, frameStart, frameSize);
    for (let freqIndex = 0; freqIndex < freqBinCount; freqIndex += 1) {
      const magnitude = measureGoertzelMagnitude(samples, frameStart, frameSize, bandCenters[freqIndex], peak, hannWindow);
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
      grid[freqIndex][timeIndex] = Math.max(0.02, Math.min(1, Math.pow(normalizedMagnitude, 0.48)));
    }
  }

  return grid;
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
