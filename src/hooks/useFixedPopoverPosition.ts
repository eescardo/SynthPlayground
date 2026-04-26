"use client";

import { RefObject, useLayoutEffect, useRef, useState } from "react";
import { clamp } from "@/lib/numeric";

interface AnchorPosition {
  left: number;
  top: number;
}

interface UseFixedPopoverPositionOptions {
  active: boolean;
  getAnchorPosition: () => AnchorPosition | null;
  margin?: number;
}

export function useFixedPopoverPosition<T extends HTMLElement>({
  active,
  getAnchorPosition,
  margin = 12
}: UseFixedPopoverPositionOptions): { popoverRef: RefObject<T | null>; left: number; top: number } {
  const popoverRef = useRef<T | null>(null);
  const [position, setPosition] = useState<AnchorPosition>({ left: margin, top: margin });

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    const updatePosition = () => {
      const anchor = getAnchorPosition();
      if (!anchor) {
        return;
      }

      const node = popoverRef.current;
      const width = node?.offsetWidth ?? 0;
      const height = node?.offsetHeight ?? 0;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const maxTop = Math.max(margin, window.innerHeight - height - margin);

      setPosition({
        left: clamp(anchor.left, margin, maxLeft),
        top: clamp(anchor.top, margin, maxTop)
      });
    };

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active, getAnchorPosition, margin]);

  return { popoverRef, left: position.left, top: position.top };
}
