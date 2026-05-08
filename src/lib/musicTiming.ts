export const samplesPerBeat = (sampleRate: number, tempoBpm: number): number => (sampleRate * 60) / tempoBpm;

export const beatToSample = (beat: number, sampleRate: number, tempoBpm: number): number =>
  Math.round(beat * samplesPerBeat(sampleRate, tempoBpm));

export const beatRangeToSampleRange = (
  startBeat: number,
  durationBeats: number,
  sampleRate: number,
  tempoBpm: number
): { startSample: number; endSample: number } => {
  const spb = samplesPerBeat(sampleRate, tempoBpm);
  return {
    startSample: Math.round(startBeat * spb),
    endSample: Math.round((startBeat + durationBeats) * spb)
  };
};

export const snapToGrid = (value: number, gridBeats: number): number => Math.round(value / gridBeats) * gridBeats;

export const snapUpToGrid = (value: number, gridBeats: number): number => Math.ceil(value / gridBeats) * gridBeats;

export const formatBeatName = (zeroBasedBeat: number, gridBeats = 0.25): string => {
  const oneBasedBeat = zeroBasedBeat + 1;
  const decimals = Math.max(0, Math.ceil(-Math.log10(gridBeats)));
  return oneBasedBeat.toFixed(Math.min(3, decimals + 1)).replace(/\.?0+$/, "");
};
