"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  TRACK_VOLUME_ARIA_MAX,
  TRACK_VOLUME_KEYBOARD_STEP,
  TRACK_VOLUME_KEYBOARD_STEP_LARGE,
  TRACK_VOLUME_MAX,
  TRACK_VOLUME_MIN,
  trackVolumeFromClientY,
  trackVolumePercentToCss,
  trackVolumeToPercent,
  trackVolumeToPercentLabel
} from "@/lib/trackVolume";

interface TrackVolumeSliderProps {
  trackName: string;
  effectiveVolume: number;
  rememberedVolume: number;
  muted: boolean;
  disabled?: boolean;
  onVolumeChange: (volume: number, options?: { commit?: boolean }) => void;
}

export function TrackVolumeSlider(props: TrackVolumeSliderProps) {
  const dragRef = useRef<HTMLDivElement | null>(null);

  const beginDrag = useCallback((clientY: number, element: HTMLDivElement) => {
    dragRef.current = element;
    if (props.disabled) {
      return;
    }
    props.onVolumeChange(trackVolumeFromClientY(clientY, element), { commit: false });
  }, [props]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const element = dragRef.current;
      if (!element) return;
      if (props.disabled) {
        dragRef.current = null;
        return;
      }
      props.onVolumeChange(trackVolumeFromClientY(event.clientY, element), { commit: false });
    };

    const onPointerUp = (event: PointerEvent) => {
      const element = dragRef.current;
      if (!element) return;
      if (props.disabled) {
        dragRef.current = null;
        return;
      }
      props.onVolumeChange(trackVolumeFromClientY(event.clientY, element), { commit: true });
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [props]);

  return (
    <div className="track-volume-slider-shell">
      <div className="track-volume-slider-center-notch" style={{ bottom: "50%" }} />
      {props.muted && props.rememberedVolume > 0 ? (
        <>
          <div
            className="track-volume-slider-ghost-fill"
            style={{ height: trackVolumePercentToCss(props.rememberedVolume) }}
          />
          <div
            className="track-volume-slider-ghost-mark"
            style={{ bottom: trackVolumePercentToCss(props.rememberedVolume) }}
          />
        </>
      ) : null}
      <div
        className={`track-volume-slider${props.disabled ? " disabled" : ""}`}
        role="slider"
        aria-label={`Volume for ${props.trackName}`}
        aria-disabled={props.disabled}
        aria-valuemin={TRACK_VOLUME_MIN}
        aria-valuemax={TRACK_VOLUME_ARIA_MAX}
        aria-valuenow={Math.round(trackVolumeToPercent(props.effectiveVolume))}
        aria-valuetext={trackVolumeToPercentLabel(props.effectiveVolume)}
        tabIndex={props.disabled ? -1 : 0}
        onPointerDown={(event) => beginDrag(event.clientY, event.currentTarget)}
        onKeyDown={(event) => {
          if (props.disabled) {
            return;
          }
          const step = event.shiftKey ? TRACK_VOLUME_KEYBOARD_STEP_LARGE : TRACK_VOLUME_KEYBOARD_STEP;
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            props.onVolumeChange(Math.min(TRACK_VOLUME_MAX, props.effectiveVolume + step), { commit: true });
          } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            props.onVolumeChange(Math.max(TRACK_VOLUME_MIN, props.effectiveVolume - step), { commit: true });
          } else if (event.key === "Home") {
            event.preventDefault();
            props.onVolumeChange(TRACK_VOLUME_MIN, { commit: true });
          } else if (event.key === "End") {
            event.preventDefault();
            props.onVolumeChange(TRACK_VOLUME_MAX, { commit: true });
          }
        }}
      >
        <div className="track-volume-slider-rail" />
        <div className="track-volume-slider-active-fill" style={{ height: trackVolumePercentToCss(props.effectiveVolume) }} />
        <div className="track-volume-slider-thumb" style={{ bottom: trackVolumePercentToCss(props.effectiveVolume) }} />
      </div>
    </div>
  );
}
