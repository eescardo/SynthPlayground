export type PatchProbeKind = "scope" | "spectrum";

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
  samples: number[];
}
