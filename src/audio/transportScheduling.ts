export const TRANSPORT_LOOKAHEAD_MS = 300;
export const TRANSPORT_INITIAL_PRIME_MS = 3000;
export const TRANSPORT_SCHEDULER_TICK_MS = 25;

export const transportMsToSamples = (durationMs: number, sampleRate: number) =>
  Math.max(1, Math.round((durationMs / 1000) * sampleRate));
