"use client";

import { useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/numeric";

export interface SpectrumTooltipState {
  x: number;
  y: number;
  label: string;
}

export function resolveSpectrumTooltipPosition(clientX: number, clientY: number) {
  return {
    x: clamp(clientX + 12, 8, Math.max(8, window.innerWidth - 16)),
    y: clamp(clientY - 32, 8, Math.max(8, window.innerHeight - 16))
  };
}

export function useDelayedSpectrumTooltip(delayMs = 1000) {
  const tooltipTimerRef = useRef<number | null>(null);
  const tooltipRef = useRef<SpectrumTooltipState | null>(null);
  const [tooltip, setTooltip] = useState<SpectrumTooltipState | null>(null);

  const setTooltipState = (nextTooltip: SpectrumTooltipState | null) => {
    tooltipRef.current = nextTooltip;
    setTooltip(nextTooltip);
  };

  const hideVisibleTooltip = () => {
    if (tooltipRef.current !== null) {
      setTooltipState(null);
    }
  };

  const clearTooltip = () => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    hideVisibleTooltip();
  };

  const scheduleTooltip = (clientX: number, clientY: number, label: string) => {
    const position = resolveSpectrumTooltipPosition(clientX, clientY);
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
    }
    hideVisibleTooltip();
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltipState({
        ...position,
        label
      });
      tooltipTimerRef.current = null;
    }, delayMs);
  };

  useEffect(
    () => () => {
      if (tooltipTimerRef.current !== null) {
        window.clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
    },
    []
  );

  return {
    clearTooltip,
    scheduleTooltip,
    tooltip
  };
}
