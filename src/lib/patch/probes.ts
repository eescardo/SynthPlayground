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
const SPECTRUM_FRAME_GRID_MIN_FRAME_SIZE = 64;

export interface ProbeSpectrumFrameGrid {
  columns: number[][];
  frameSize: number;
  peak: number;
}

const PROBE_SPECTRUM_COLOR_STOPS = [
  { value: 0, color: [0, 0, 0] },
  { value: 0.001, color: [95, 57, 34] },
  { value: 0.01, color: [196, 42, 32] },
  { value: 0.1, color: [245, 134, 42] },
  { value: 1, color: [255, 246, 124] }
] as const;

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

export const resolveProbeSpectrumEffectiveMaxFrequencyHz = (requestedMaxFrequencyHz: number, sampleRate = 48000) =>
  Math.min(clampProbeMaxFrequencyHz(requestedMaxFrequencyHz), Math.max(1, sampleRate / 2));

export const resolveProbeSpectrumMagnitudeColor = (magnitude: number) => {
  const safeMagnitude = Math.max(0, Number(magnitude) || 0);
  if (safeMagnitude <= 0) {
    return "rgb(0, 0, 0)";
  }

  const firstStop = PROBE_SPECTRUM_COLOR_STOPS[1];
  if (safeMagnitude < firstStop.value) {
    const ratio = safeMagnitude / firstStop.value;
    const color = firstStop.color.map((channel) => Math.round(channel * ratio));
    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  }

  for (let index = 1; index < PROBE_SPECTRUM_COLOR_STOPS.length - 1; index += 1) {
    const low = PROBE_SPECTRUM_COLOR_STOPS[index];
    const high = PROBE_SPECTRUM_COLOR_STOPS[index + 1];
    if (safeMagnitude <= high.value) {
      const ratio =
        (Math.log10(safeMagnitude) - Math.log10(low.value)) / (Math.log10(high.value) - Math.log10(low.value));
      const color = low.color.map((channel, channelIndex) =>
        Math.round(channel + (high.color[channelIndex] - channel) * clamp(ratio, 0, 1))
      );
      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    }
  }

  const finalColor = PROBE_SPECTRUM_COLOR_STOPS[PROBE_SPECTRUM_COLOR_STOPS.length - 1].color;
  return `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;
};

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
