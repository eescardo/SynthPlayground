"use client";

import { TrackVolumeSlider } from "@/components/TrackVolumeSlider";
import {
  TRACK_VOLUME_DEFAULT_LABEL,
  TRACK_VOLUME_MAX_LABEL,
  TRACK_VOLUME_MIN_LABEL,
  trackVolumeToPercentLabel
} from "@/lib/trackVolume";
import styles from "./TrackPopovers.module.css";

interface TrackVolumePopoverProps {
  trackName: string;
  effectiveVolume: number;
  rememberedVolume: number;
  muted: boolean;
  automated: boolean;
  top: string;
  left: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onVolumeChange: (volume: number, options?: { commit?: boolean }) => void;
  onBindToAutomation: () => void;
  onUnbindFromAutomation: () => void;
}

export function TrackVolumePopover(props: TrackVolumePopoverProps) {
  const automationTitle = props.automated
    ? "Automated in timeline. Click to revert to fixed value"
    : "Click to automate in timeline";

  return (
    <div
      className={styles.volumePopover}
      data-track-popover="volume"
      style={{ top: props.top, left: props.left }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className={styles.volumePopoverLabel}>{trackVolumeToPercentLabel(props.effectiveVolume)}</span>
      <div className={styles.volumeBody}>
        <TrackVolumeSlider
          trackName={props.trackName}
          effectiveVolume={props.effectiveVolume}
          rememberedVolume={props.rememberedVolume}
          muted={props.muted}
          disabled={props.automated}
          onVolumeChange={props.onVolumeChange}
        />
        <div className={styles.volumeScale}>
          <span>{TRACK_VOLUME_MAX_LABEL}</span>
          <span>{TRACK_VOLUME_DEFAULT_LABEL}</span>
          <span>{TRACK_VOLUME_MIN_LABEL}</span>
        </div>
      </div>
      <button
        type="button"
        className={styles.automationPill}
        title={automationTitle}
        aria-label={automationTitle}
        onClick={props.automated ? props.onUnbindFromAutomation : props.onBindToAutomation}
      >
        {props.automated ? "auto" : "fixed"}
      </button>
    </div>
  );
}
