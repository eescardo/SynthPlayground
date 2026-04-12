import { createId } from "@/lib/ids";
import { PatchWorkspaceProbeState } from "@/types/probes";

export const DEFAULT_SCOPE_PROBE_SIZE = { width: 10, height: 6 } as const;
export const DEFAULT_SPECTRUM_PROBE_SIZE = { width: 10, height: 6 } as const;
export const EXPANDED_PROBE_SIZE = { width: 340, height: 228 } as const;
const MIN_PROBE_NORMALIZATION_PEAK = 0.0001;

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
  spectrumWindowSize: kind === "spectrum" ? 1024 : undefined
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
