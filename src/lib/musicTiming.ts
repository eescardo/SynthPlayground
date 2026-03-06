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

export const snapToGrid = (value: number, gridBeats: number): number =>
  Math.round(value / gridBeats) * gridBeats;
