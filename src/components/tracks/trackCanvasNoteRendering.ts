const PITCH_LABEL_PATTERN = /^([A-G](?:#|b)?)(-?\d+)(?:([+-]\d+))?$/;
const MIN_SHADED_OCTAVE = 1;
const MAX_SHADED_OCTAVE = 7;
const MIN_NOTE_LIGHTNESS = 0.25;
const MAX_NOTE_LIGHTNESS = 0.75;
const GRID_NOTE_EPSILON = 1e-9;

export interface TrackCanvasPitchLabel {
  noteName: string;
  octaveText: string | null;
  offsetText: string | null;
  octaveNumber: number | null;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function splitTrackCanvasPitchLabel(pitchStr: string): TrackCanvasPitchLabel {
  const match = PITCH_LABEL_PATTERN.exec(pitchStr.trim());
  if (!match) {
    return {
      noteName: pitchStr,
      octaveText: null,
      offsetText: null,
      octaveNumber: null
    };
  }

  const [, noteName, octaveText, offsetText] = match;
  return {
    noteName,
    octaveText: offsetText ? `${octaveText}${offsetText}` : octaveText,
    offsetText: offsetText ?? null,
    octaveNumber: Number.parseInt(octaveText, 10)
  };
}

export function shouldCenterTrackCanvasNoteLabel(durationBeats: number, gridBeats: number): boolean {
  return durationBeats <= gridBeats + GRID_NOTE_EPSILON;
}

export function resolveTrackCanvasNoteFill(baseColor: string, octaveNumber: number | null): string {
  if (octaveNumber === null) {
    return baseColor;
  }

  const rgb = parseHexColor(baseColor);
  if (!rgb) {
    return baseColor;
  }

  const hsl = rgbToHsl(rgb);
  const clampedOctave = Math.max(MIN_SHADED_OCTAVE, Math.min(MAX_SHADED_OCTAVE, octaveNumber));
  const octaveRatio =
    (clampedOctave - MIN_SHADED_OCTAVE) / (MAX_SHADED_OCTAVE - MIN_SHADED_OCTAVE);
  const nextLightness =
    MIN_NOTE_LIGHTNESS + octaveRatio * (MAX_NOTE_LIGHTNESS - MIN_NOTE_LIGHTNESS);
  return rgbToHex(hslToRgb({ ...hsl, l: nextLightness }));
}

export function resolveTrackCanvasNoteLabelFill(fillColor: string, defaultLabelColor: string): string {
  const rgb = parseHexColor(fillColor);
  if (!rgb) {
    return defaultLabelColor;
  }

  const relativeLuminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return relativeLuminance >= 0.6 ? "#10263b" : defaultLabelColor;
}

function parseHexColor(color: string): RgbColor | null {
  const normalized = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl({ r, g, b }: RgbColor): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  const lightness = (max + min) * 0.5;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  switch (max) {
    case rNorm:
      hue = ((gNorm - bNorm) / delta) % 6;
      break;
    case gNorm:
      hue = (bNorm - rNorm) / delta + 2;
      break;
    default:
      hue = (rNorm - gNorm) / delta + 4;
      break;
  }

  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({
  h,
  s,
  l
}: {
  h: number;
  s: number;
  l: number;
}): RgbColor {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = h / 60;
  const second = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = l - chroma * 0.5;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (huePrime >= 0 && huePrime < 1) {
    rPrime = chroma;
    gPrime = second;
  } else if (huePrime < 2) {
    rPrime = second;
    gPrime = chroma;
  } else if (huePrime < 3) {
    gPrime = chroma;
    bPrime = second;
  } else if (huePrime < 4) {
    gPrime = second;
    bPrime = chroma;
  } else if (huePrime < 5) {
    rPrime = second;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = second;
  }

  return {
    r: (rPrime + match) * 255,
    g: (gPrime + match) * 255,
    b: (bPrime + match) * 255
  };
}
