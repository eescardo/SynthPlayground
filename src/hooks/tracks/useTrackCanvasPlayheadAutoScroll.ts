import { RefObject, useEffect, useRef } from "react";
import { getPlayheadScrollLeft } from "@/components/tracks/trackCanvasAutoScroll";

interface UseTrackCanvasPlayheadAutoScrollArgs {
  beatWidth?: number;
  wrapperRef: RefObject<HTMLDivElement | null>;
  playheadBeat: number;
  playheadFocused: boolean;
  isPlaying: boolean;
}

export function useTrackCanvasPlayheadAutoScroll({
  beatWidth,
  wrapperRef,
  playheadBeat,
  playheadFocused,
  isPlaying
}: UseTrackCanvasPlayheadAutoScrollArgs) {
  const previousPlayheadBeatRef = useRef(playheadBeat);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    const playheadChanged = previousPlayheadBeatRef.current !== playheadBeat;
    previousPlayheadBeatRef.current = playheadBeat;
    if (!playheadChanged) {
      return;
    }

    const nextScrollLeft = isPlaying
      ? getPlayheadScrollLeft({
          playheadBeat,
          beatWidth,
          scrollLeft: wrapper.scrollLeft,
          clientWidth: wrapper.clientWidth,
          scrollWidth: wrapper.scrollWidth,
          strategy: "follow"
        })
      : playheadFocused
        ? getPlayheadScrollLeft({
            playheadBeat,
            beatWidth,
            scrollLeft: wrapper.scrollLeft,
            clientWidth: wrapper.clientWidth,
            scrollWidth: wrapper.scrollWidth,
            strategy: "reveal"
          })
        : wrapper.scrollLeft;
    if (Math.abs(nextScrollLeft - wrapper.scrollLeft) > 0.5) {
      wrapper.scrollLeft = nextScrollLeft;
    }
  }, [beatWidth, isPlaying, playheadBeat, playheadFocused, wrapperRef]);
}
