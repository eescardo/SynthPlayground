import { clamp01 } from "@/lib/numeric";

export const TRACK_PAN_MIN = 0;
export const TRACK_PAN_CENTER = 0.5;
export const TRACK_PAN_MAX = 1;

export const clampTrackPan = (pan: number): number => clamp01(pan);

export type TrackPanLabel = "L" | "LR" | "R";
export type TrackPanTone = "left" | "soft-left" | "center" | "soft-right" | "right";

const TRACK_PAN_DISPLAY_BANDS: ReadonlyArray<{
  upperBound: number;
  label: TrackPanLabel;
  tone: TrackPanTone;
}> = [
  { upperBound: 0.125, label: "L", tone: "left" },
  { upperBound: 0.375, label: "L", tone: "soft-left" },
  { upperBound: 0.625, label: "LR", tone: "center" },
  { upperBound: 0.875, label: "R", tone: "soft-right" },
  { upperBound: TRACK_PAN_MAX, label: "R", tone: "right" }
];

type TrackPanDisplayBand = (typeof TRACK_PAN_DISPLAY_BANDS)[number];

const trackPanToDisplayBand = (pan: number): TrackPanDisplayBand => {
  const clamped = clampTrackPan(pan);
  const band = TRACK_PAN_DISPLAY_BANDS.find(({ upperBound }) => clamped <= upperBound);
  if (!band) {
    throw new Error(`Track pan display bands do not cover clamped pan value ${clamped}`);
  }
  return band;
};

export const trackPanToLabel = (pan: number): TrackPanLabel => trackPanToDisplayBand(pan).label;

export const trackPanToTone = (pan: number): TrackPanTone => trackPanToDisplayBand(pan).tone;

export const trackPanToPercentLabel = (pan: number): string => {
  const clamped = clampTrackPan(pan);
  if (Math.abs(clamped - TRACK_PAN_CENTER) < 0.005) {
    return "Center";
  }
  const side = clamped < TRACK_PAN_CENTER ? "L" : "R";
  const amount = Math.round(Math.abs(clamped - TRACK_PAN_CENTER) * 200);
  return `${side} ${amount}%`;
};
