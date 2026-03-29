"use client";

import { TrackVolumeSlider } from "@/components/TrackVolumeSlider";

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
      <span className="track-volume-popover-label">{Math.round(props.effectiveVolume * 100)}%</span>
      <TrackVolumeSlider
        trackName={props.trackName}
        effectiveVolume={props.effectiveVolume}
        rememberedVolume={props.rememberedVolume}
        muted={props.muted}
        onVolumeChange={props.onVolumeChange}
      />
      <div className="track-volume-scale">
        <span>200%</span>
        <span>100%</span>
        <span>0%</span>
      </div>
    </div>
  );
}
