"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_HOVER_ARM_DELAY_MS = 1000;

interface UseHoverArmOptions {
  delayMs?: number;
}

export function useHoverArm<T>({ delayMs = DEFAULT_HOVER_ARM_DELAY_MS }: UseHoverArmOptions = {}) {
  const [armedId, setArmedId] = useState<T | null>(null);
  const armTimerRef = useRef<number | null>(null);

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearArmTimer();
  }, [clearArmTimer]);

  const arm = useCallback((id: T) => {
    clearArmTimer();
    armTimerRef.current = window.setTimeout(() => {
      setArmedId(id);
    }, delayMs);
  }, [clearArmTimer, delayMs]);

  const disarm = useCallback((id?: T) => {
    clearArmTimer();
    setArmedId((current) => {
      if (id === undefined || Object.is(current, id)) {
        return null;
      }
      return current;
    });
  }, [clearArmTimer]);

  const isArmed = useCallback((id: T) => Object.is(armedId, id), [armedId]);

  return {
    arm,
    armedId,
    disarm,
    isArmed
  };
}
