import { clamp01 } from "@/lib/numeric";

export const TRACK_PAN_MIN = 0;
export const TRACK_PAN_CENTER = 0.5;
export const TRACK_PAN_MAX = 1;

export const clampTrackPan = (pan: number): number => clamp01(pan);

export const trackPanToLabel = (pan: number): string => {
  const clamped = clampTrackPan(pan);
  if (clamped <= 0.125) {
    return "L";
  }
  if (clamped < 0.375) {
    return "L";
  }
  if (clamped <= 0.625) {
    return "LR";
  }
  if (clamped < 0.875) {
    return "R";
  }
  return "R";
};

export const trackPanToTone = (pan: number): "left" | "soft-left" | "center" | "soft-right" | "right" => {
  const clamped = clampTrackPan(pan);
  if (clamped <= 0.125) {
    return "left";
  }
  if (clamped < 0.375) {
    return "soft-left";
  }
  if (clamped <= 0.625) {
    return "center";
  }
  if (clamped < 0.875) {
    return "soft-right";
  }
  return "right";
};

export const trackPanToPercentLabel = (pan: number): string => {
  const clamped = clampTrackPan(pan);
  if (Math.abs(clamped - TRACK_PAN_CENTER) < 0.005) {
    return "Center";
  }
  const side = clamped < TRACK_PAN_CENTER ? "L" : "R";
  const amount = Math.round(Math.abs(clamped - TRACK_PAN_CENTER) * 200);
  return `${side} ${amount}%`;
};
