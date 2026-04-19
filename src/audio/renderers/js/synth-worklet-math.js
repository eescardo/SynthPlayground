export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export const dbToGain = (db) => Math.pow(10, db / 20);
export const onePoleStep = (current, target, alpha) => current + (target - current) * (1 - alpha);

export const smoothingAlpha = (timeMs, sampleRate) => {
  if (!timeMs || timeMs <= 0) {
    return 0;
  }
  const tauSamples = (timeMs / 1000) * sampleRate;
  return Math.exp(-1 / Math.max(1, tauSamples));
};

export const voctToHz = (voct) => 261.625565 * Math.pow(2, voct);

export const waveformSample = (wave, phase, pulseWidth = 0.5) => {
  switch (wave) {
    case "sine":
      return Math.sin(phase * Math.PI * 2);
    case "triangle": {
      const t = (phase + 0.25) % 1;
      return 1 - 4 * Math.abs(Math.round(t - 0.25) - (t - 0.25));
    }
    case "saw":
      return 2 * phase - 1;
    case "square":
      return phase < pulseWidth ? 1 : -1;
    default:
      return Math.sin(phase * Math.PI * 2);
  }
};
