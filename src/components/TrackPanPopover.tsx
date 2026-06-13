"use client";

import { trackPanToPercentLabel, TRACK_PAN_CENTER, TRACK_PAN_MAX, TRACK_PAN_MIN } from "@/lib/trackPan";
import styles from "./TrackPopovers.module.css";

interface TrackPanPopoverProps {
  trackName: string;
  pan: number;
  automated: boolean;
  top: string;
  left: string;
  onPanChange: (pan: number, options?: { commit?: boolean }) => void;
  onBindToAutomation: () => void;
  onUnbindFromAutomation: () => void;
}

export function TrackPanPopover(props: TrackPanPopoverProps) {
  const automationTitle = props.automated
    ? "Automated in timeline. Click to revert to fixed value"
    : "Click to automate in timeline";

  return (
    <div
      className={styles.panPopover}
      data-track-popover="pan"
      style={{ top: props.top, left: props.left }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className={styles.panPopoverHeader}>
        <span>Pan</span>
        <strong>{trackPanToPercentLabel(props.pan)}</strong>
      </div>
      <div className={styles.panSliderRow}>
        <span>L</span>
        <input
          type="range"
          min={TRACK_PAN_MIN}
          max={TRACK_PAN_MAX}
          step={0.01}
          value={props.pan}
          disabled={props.automated}
          aria-label={`Pan for ${props.trackName}`}
          onChange={(event) => props.onPanChange(Number(event.currentTarget.value), { commit: false })}
          onPointerUp={(event) => props.onPanChange(Number(event.currentTarget.value), { commit: true })}
          onKeyDown={(event) => {
            if (event.key === "Home") {
              event.preventDefault();
              props.onPanChange(TRACK_PAN_MIN, { commit: true });
            } else if (event.key === "End") {
              event.preventDefault();
              props.onPanChange(TRACK_PAN_MAX, { commit: true });
            } else if (event.key === "c" || event.key === "C") {
              props.onPanChange(TRACK_PAN_CENTER, { commit: true });
            }
          }}
        />
        <span>R</span>
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
