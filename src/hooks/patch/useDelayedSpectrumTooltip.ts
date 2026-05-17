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
  const [tooltip, setTooltip] = useState<SpectrumTooltipState | null>(null);

  const clearTooltip = () => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  };

  const scheduleTooltip = (clientX: number, clientY: number, label: string) => {
    const position = resolveSpectrumTooltipPosition(clientX, clientY);
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
    }
    setTooltip(null);
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltip({
        ...position,
        label
      });
      tooltipTimerRef.current = null;
    }, delayMs);
  };

  useEffect(() => clearTooltip, []);

  return {
    clearTooltip,
    scheduleTooltip,
    tooltip
  };
}
