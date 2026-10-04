"use client";

import { useEffect, useState, type RefObject } from "react";

export interface CanvasShellGeometry {
  left: number;
  top: number;
  scrollTop: number;
  height: number;
  borderLeft: number;
  borderTop: number;
}

/** Screen-space measurements for chrome anchored to a scrolling canvas shell. */
export function useCanvasShellGeometry(shellRef: RefObject<HTMLDivElement | null>): CanvasShellGeometry {
  const [geometry, setGeometry] = useState<CanvasShellGeometry>({
    left: 0,
    top: 0,
    scrollTop: 0,
    height: 0,
    borderLeft: 0,
    borderTop: 0
  });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const measure = () => {
      const rect = shell.getBoundingClientRect();
      const next = {
        left: rect.left,
        top: rect.top,
        scrollTop: shell.scrollTop,
        height: shell.clientHeight,
        borderLeft: shell.clientLeft,
        borderTop: shell.clientTop
      };
      setGeometry((previous) =>
        previous.left === next.left &&
        previous.top === next.top &&
        previous.scrollTop === next.scrollTop &&
        previous.height === next.height &&
        previous.borderLeft === next.borderLeft &&
        previous.borderTop === next.borderTop
          ? previous
          : next
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [shellRef]);

  return geometry;
}
