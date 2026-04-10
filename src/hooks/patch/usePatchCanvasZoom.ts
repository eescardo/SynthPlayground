"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { PATCH_CANVAS_MAX_ZOOM, PATCH_CANVAS_MIN_ZOOM } from "@/components/patch/patchCanvasConstants";

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
  canvasSize: { width: number; height: number };
  fitSize?: { width: number; height: number };
  patchId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  savedZoom?: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  onZoomChange: (zoom: number) => void;
}

function resolveFitZoom(scrollEl: HTMLDivElement, fitSize: { width: number; height: number }) {
  const widthRatio = scrollEl.clientWidth > 0 ? scrollEl.clientWidth / fitSize.width : 1;
  const heightRatio = scrollEl.clientHeight > 0 ? scrollEl.clientHeight / fitSize.height : 1;
  return clamp(Math.min(widthRatio, heightRatio), PATCH_CANVAS_MIN_ZOOM, PATCH_CANVAS_MAX_ZOOM);
}

export function usePatchCanvasZoom({ canvasSize, fitSize = canvasSize, onZoomChange, patchId, rootRef, savedZoom, scrollRef }: UsePatchCanvasZoomParams) {
  const [zoom, setZoom] = useState(savedZoom ?? 1);
  const zoomRef = useRef(zoom);
  const hasUserZoomedRef = useRef(savedZoom !== undefined);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    hasUserZoomedRef.current = savedZoom !== undefined;
    if (savedZoom !== undefined) {
      zoomRef.current = savedZoom;
      setZoom(savedZoom);
    }
  }, [patchId, savedZoom]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || savedZoom !== undefined || hasUserZoomedRef.current) {
      return;
    }

    const applyFitZoom = () => {
      if (hasUserZoomedRef.current || savedZoom !== undefined) {
        return;
      }
      const nextZoom = resolveFitZoom(scrollEl, fitSize);
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
    };

    applyFitZoom();
    const resizeObserver = new ResizeObserver(applyFitZoom);
    resizeObserver.observe(scrollEl);
    return () => resizeObserver.disconnect();
  }, [fitSize, patchId, savedZoom, scrollRef]);

  const applyCanvasWheelZoom = useCallback((event: WheelEvent, anchor: { x: number; y: number }) => {
    event.preventDefault();
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }
    const currentZoom = zoomRef.current;
    const canvasX = (scrollEl.scrollLeft + anchor.x) / currentZoom;
    const canvasY = (scrollEl.scrollTop + anchor.y) / currentZoom;
    const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * ZOOM_WHEEL_SENSITIVITY), PATCH_CANVAS_MIN_ZOOM, PATCH_CANVAS_MAX_ZOOM);
    if (Math.abs(nextZoom - currentZoom) < 0.001) {
      return;
    }
    hasUserZoomedRef.current = true;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    onZoomChange(nextZoom);
    window.requestAnimationFrame(() => {
      scrollEl.scrollLeft = canvasX * nextZoom - anchor.x;
      scrollEl.scrollTop = canvasY * nextZoom - anchor.y;
    });
  }, [onZoomChange, scrollRef]);

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
