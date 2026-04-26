export const TRACK_VOLUME_MIN = 0;
export const TRACK_VOLUME_DEFAULT = 1;
export const TRACK_VOLUME_MAX = 2;
export const TRACK_VOLUME_PERCENT_MULTIPLIER = 100;
export const TRACK_VOLUME_ARIA_MAX = TRACK_VOLUME_MAX * TRACK_VOLUME_PERCENT_MULTIPLIER;
export const TRACK_VOLUME_KEYBOARD_STEP = 0.05;
export const TRACK_VOLUME_KEYBOARD_STEP_LARGE = 0.2;
export const TRACK_VOLUME_MIN_LABEL = `${TRACK_VOLUME_MIN * TRACK_VOLUME_PERCENT_MULTIPLIER}%`;
export const TRACK_VOLUME_DEFAULT_LABEL = `${TRACK_VOLUME_DEFAULT * TRACK_VOLUME_PERCENT_MULTIPLIER}%`;
export const TRACK_VOLUME_MAX_LABEL = `${TRACK_VOLUME_MAX * TRACK_VOLUME_PERCENT_MULTIPLIER}%`;

export const clampTrackVolume = (volume: number): number =>
  clamp(volume, TRACK_VOLUME_MIN, TRACK_VOLUME_MAX);

export const isTrackVolumeMuted = (volume: number): boolean => volume <= TRACK_VOLUME_MIN;

export const trackVolumeToPercent = (volume: number): number =>
  clampTrackVolume(volume) / TRACK_VOLUME_MAX * TRACK_VOLUME_ARIA_MAX;

export const trackVolumeToSliderPercent = (volume: number): number =>
  clampTrackVolume(volume) / TRACK_VOLUME_MAX * 100;

export const trackVolumeToPercentLabel = (volume: number): string =>
  `${Math.round(trackVolumeToPercent(volume))}%`;

export const trackVolumePercentToCss = (volume: number): string =>
  `${trackVolumeToSliderPercent(volume)}%`;

export const trackVolumeFromClientY = (clientY: number, element: HTMLElement): number => {
  const rect = element.getBoundingClientRect();
  const normalized = 1 - (clientY - rect.top) / rect.height;
  return clampTrackVolume(normalized * TRACK_VOLUME_MAX);
};
import { clamp } from "@/lib/numeric";
