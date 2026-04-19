export const compileAudioProjectToWasmSubsetCore: (project: unknown, options: { blockSize: number }) => unknown;
export const compileSchedulerEventsToWasmSubsetCore: (project: unknown, projectSpec: unknown, events: unknown[]) => unknown;
export const compilePreviewProbeCaptureRequestsCore: (
  project: unknown,
  projectSpec: unknown,
  trackId: string,
  captureProbes: unknown[],
  durationSamples: number
) => unknown;
