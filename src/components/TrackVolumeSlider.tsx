"use client";

import { useCallback, useEffect, useRef } from "react";

interface TrackVolumeSliderProps {
  trackName: string;
  effectiveVolume: number;
  rememberedVolume: number;
  muted: boolean;
  onVolumeChange: (volume: number, options?: { commit?: boolean }) => void;
}

const getVolumePercent = (volume: number) => Math.max(0, Math.min(100, (volume / 2) * 100));
const getVolumeMarkerBottom = (volume: number) => `${getVolumePercent(volume)}%`;
const getVolumeFromClientY = (clientY: number, element: HTMLDivElement) => {
  const rect = element.getBoundingClientRect();
  const normalized = 1 - (clientY - rect.top) / rect.height;
  return Math.max(0, Math.min(2, normalized * 2));
};

export function TrackVolumeSlider(props: TrackVolumeSliderProps) {
  const dragRef = useRef<HTMLDivElement | null>(null);

  const beginDrag = useCallback((clientY: number, element: HTMLDivElement) => {
    dragRef.current = element;
    props.onVolumeChange(getVolumeFromClientY(clientY, element), { commit: false });
  }, [props]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const element = dragRef.current;
      if (!element) return;
      props.onVolumeChange(getVolumeFromClientY(event.clientY, element), { commit: false });
    };

    const onPointerUp = (event: PointerEvent) => {
      const element = dragRef.current;
      if (!element) return;
      props.onVolumeChange(getVolumeFromClientY(event.clientY, element), { commit: true });
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
            style={{ height: getVolumeMarkerBottom(props.rememberedVolume) }}
          />
          <div
            className="track-volume-slider-ghost-mark"
            style={{ bottom: getVolumeMarkerBottom(props.rememberedVolume) }}
          />
        </>
      ) : null}
      <div
        className="track-volume-slider"
        role="slider"
        aria-label={`Volume for ${props.trackName}`}
        aria-valuemin={0}
        aria-valuemax={200}
        aria-valuenow={Math.round(props.effectiveVolume * 100)}
        aria-valuetext={`${Math.round(props.effectiveVolume * 100)}%`}
        tabIndex={0}
        onPointerDown={(event) => beginDrag(event.clientY, event.currentTarget)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.2 : 0.05;
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            props.onVolumeChange(Math.min(2, props.effectiveVolume + step), { commit: true });
          } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            props.onVolumeChange(Math.max(0, props.effectiveVolume - step), { commit: true });
          } else if (event.key === "Home") {
            event.preventDefault();
            props.onVolumeChange(0, { commit: true });
          } else if (event.key === "End") {
            event.preventDefault();
            props.onVolumeChange(2, { commit: true });
          }
        }}
      >
        <div className="track-volume-slider-rail" />
        <div className="track-volume-slider-active-fill" style={{ height: `${getVolumePercent(props.effectiveVolume)}%` }} />
        <div className="track-volume-slider-thumb" style={{ bottom: `${getVolumePercent(props.effectiveVolume)}%` }} />
      </div>
    </div>
  );
}
