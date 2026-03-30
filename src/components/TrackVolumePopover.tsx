"use client";

import { TrackVolumeSlider } from "@/components/TrackVolumeSlider";
import {
  TRACK_VOLUME_DEFAULT_LABEL,
  TRACK_VOLUME_MAX_LABEL,
  TRACK_VOLUME_MIN_LABEL,
  trackVolumeToPercentLabel
} from "@/lib/trackVolume";

interface TrackVolumePopoverProps {
  trackName: string;
  effectiveVolume: number;
  rememberedVolume: number;
  muted: boolean;
  top: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onVolumeChange: (volume: number, options?: { commit?: boolean }) => void;
}

export function TrackVolumePopover(props: TrackVolumePopoverProps) {
  return (
    <div
      className="track-volume-popover"
      style={{ top: props.top }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="track-volume-popover-label">{trackVolumeToPercentLabel(props.effectiveVolume)}</span>
      <TrackVolumeSlider
        trackName={props.trackName}
        effectiveVolume={props.effectiveVolume}
        rememberedVolume={props.rememberedVolume}
        muted={props.muted}
        onVolumeChange={props.onVolumeChange}
      />
      <div className="track-volume-scale">
        <span>{TRACK_VOLUME_MAX_LABEL}</span>
        <span>{TRACK_VOLUME_DEFAULT_LABEL}</span>
        <span>{TRACK_VOLUME_MIN_LABEL}</span>
      </div>
    </div>
  );
}
