export type PatchProbeKind = "scope" | "spectrum" | "pitch_tracker" | "signal_health";

export type PatchProbePortKind = "in" | "out";

export interface PatchProbePortTarget {
  kind: "port";
  nodeId: string;
  portId: string;
  portKind: PatchProbePortKind;
}

export interface PatchProbeConnectionTarget {
  kind: "connection";
  connectionId: string;
}

export type PatchProbeTarget = PatchProbePortTarget | PatchProbeConnectionTarget;

export interface PatchProbeFrequencyView {
  maxHz: number;
}

export interface PatchWorkspaceProbeState {
  id: string;
  kind: PatchProbeKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  expanded?: boolean;
  target?: PatchProbeTarget;
  spectrumWindowSize?: number;
  frequencyView?: PatchProbeFrequencyView;
}

export interface PreviewProbeRequest {
  probeId: string;
  kind: PatchProbeKind;
  target: PatchProbeTarget;
  spectrumWindowSize?: number;
}

export interface PreviewProbeCapture {
  probeId: string;
  kind: PatchProbeKind;
  target: PatchProbeTarget;
  sampleRate: number;
  durationSamples: number;
  capturedSamples: number;
  captureComplete?: boolean;
  sourceCapturedSamples?: number;
  sampleStride?: number;
  samples: ArrayLike<number>;
  sampleBuffer?: SharedArrayBuffer;
  sampleLength?: number;
  spectrumFrames?: PreviewProbeSpectrumFrames;
  finalSpectrum?: PreviewProbeFinalSpectrum;
  finalScope?: PreviewProbeFinalScope;
  adsrEstimate?: PreviewProbeAdsrEstimate;
  qualityStats?: PreviewProbeQualityStats;
}

export interface PreviewProbeScopeBucket {
  min: number;
  max: number;
  peak: number;
}

export interface PreviewProbeFinalScope {
  waveformBuckets: PreviewProbeScopeBucket[];
  envelopeBuckets: number[];
  peak: number;
  sampleRate: number;
  capturedSamples: number;
}

export interface PreviewProbeAdsrEstimate {
  attackSeconds: number;
  decaySeconds: number;
  sustainRatio: number;
  releaseSeconds: number;
  label: string;
}

export interface PreviewProbeQualityStats {
  peak: number;
  peakDb: number;
  rms: number;
  rmsDb: number;
  dcOffset: number;
  crestFactorDb: number;
  nearClipCount: number;
  clippedCount: number;
  maxConsecutiveNearClip: number;
  maxDelta: number;
  zeroCrossingRate: number;
  roughness: number;
  capturedSamples: number;
}

export interface PreviewProbeSpectrumFrames {
  columns?: number[][];
  values?: number[];
  rowCount?: number;
  columnCount?: number;
  binFrequencies: number[];
  startColumn?: number;
  frameSize: number;
  sampleRate: number;
  capturedSamples: number;
}

export interface PreviewProbeFinalSpectrum {
  columns?: number[][];
  values?: number[];
  rowCount?: number;
  columnCount?: number;
  binFrequencies?: number[];
  startColumn?: number;
  complete?: boolean;
  frameSize: number;
  sampleRate: number;
  capturedSamples: number;
  requestedTimeColumns: number;
  requestedFrequencyBins: number;
  sourceColumnCount: number;
}

export interface PreviewProbeSharedBuffer {
  probeId: string;
  sampleBuffer: SharedArrayBuffer;
  capacitySamples: number;
}

export interface PatchProbeEditorState {
  probes: PatchWorkspaceProbeState[];
  selectedProbeId?: string;
  previewCaptureByProbeId: Record<string, PreviewProbeCapture>;
  previewProgress: number;
  attachingProbeId?: string | null;
}

export interface PatchProbeEditorActions {
  addProbe: (kind: PatchWorkspaceProbeState["kind"], position?: { x: number; y: number }) => void;
  moveProbe: (probeId: string, x: number, y: number) => void;
  selectProbe: (probeId?: string) => void;
  updateTarget: (probeId: string, target?: PatchProbeTarget) => void;
  updateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  updateFrequencyView: (probeId: string, maxHz: number) => void;
  toggleExpanded: (probeId: string) => void;
  deleteSelected: () => void;
}
