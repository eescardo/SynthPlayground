"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const ZOOM_WHEEL_SENSITIVITY = 0.0012;
const MOUSE_WHEEL_ZOOM_DELTA_THRESHOLD = 48;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shouldZoomFromWheel(event: WheelEvent, isOverCanvasScroll: boolean) {
  if (event.ctrlKey) {
    return true;
  }
  if (!isOverCanvasScroll) {
    return false;
  }
  if (event.deltaMode !== 0) {
    return true;
  }
  return Math.abs(event.deltaY) >= MOUSE_WHEEL_ZOOM_DELTA_THRESHOLD && Math.abs(event.deltaX) < 2;
}

interface UsePatchCanvasZoomParams {
  rootRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function usePatchCanvasZoom({ rootRef, scrollRef }: UsePatchCanvasZoomParams) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const applyCanvasWheelZoom = useCallback((event: WheelEvent, anchor: { x: number; y: number }) => {
    event.preventDefault();
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }
    const currentZoom = zoomRef.current;
    const canvasX = (scrollEl.scrollLeft + anchor.x) / currentZoom;
    const canvasY = (scrollEl.scrollTop + anchor.y) / currentZoom;
    const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * ZOOM_WHEEL_SENSITIVITY), MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(nextZoom - currentZoom) < 0.001) {
      return;
    }
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      scrollEl.scrollLeft = canvasX * nextZoom - anchor.x;
      scrollEl.scrollTop = canvasY * nextZoom - anchor.y;
    });
  }, [scrollRef]);

  useEffect(() => {
    const rootEl = rootRef.current;
    const scrollEl = scrollRef.current;
    if (!rootEl || !scrollEl) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      const scrollRect = scrollEl.getBoundingClientRect();
      const target = event.target instanceof Node ? event.target : null;
      const isOverCanvasScroll = target ? scrollEl.contains(target) : false;
      if (!shouldZoomFromWheel(event, isOverCanvasScroll)) {
        return;
      }

      const anchor = isOverCanvasScroll
        ? {
            x: event.clientX - scrollRect.left,
            y: event.clientY - scrollRect.top
          }
        : {
            x: scrollEl.clientWidth / 2,
            y: scrollEl.clientHeight / 2
          };
      applyCanvasWheelZoom(event, anchor);
    };

    rootEl.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => rootEl.removeEventListener("wheel", onWheel, { capture: true });
  }, [applyCanvasWheelZoom, rootRef, scrollRef]);

  return { zoom };
}
