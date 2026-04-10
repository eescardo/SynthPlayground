"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { findPitchRect, PitchRect } from "@/components/tracks/trackCanvasGeometry";
import { midiToPitch, pitchToMidi } from "@/lib/pitch";
import type { Track } from "@/types/music";

interface UseTrackCanvasWheelPitchEditingOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  pitchRectsRef: RefObject<PitchRect[]>;
  tracks: Track[];
  getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
  onUpdateNote: (
    trackId: string,
    noteId: string,
    patch: { pitchStr: string },
    options: { actionKey: string }
  ) => void;
}

export function useTrackCanvasWheelPitchEditing({
  wrapperRef,
  pitchRectsRef,
  tracks,
  getCanvasPoint,
  onUpdateNote
}: UseTrackCanvasWheelPitchEditingOptions) {
  const wheelPitchLockUntilRef = useRef(0);
  const wheelLockedScrollTopRef = useRef(0);
  const wheelLockedScrollLeftRef = useRef(0);
  const wheelLockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const engageWheelLock = (now: number) => {
      const wasUnlocked = now >= wheelPitchLockUntilRef.current;
      wheelPitchLockUntilRef.current = now + 420;
      if (wasUnlocked) {
        wheelLockedScrollTopRef.current = wrapper.scrollTop;
        wheelLockedScrollLeftRef.current = wrapper.scrollLeft;
      }
      wrapper.style.overflowX = "hidden";
      if (wheelLockTimerRef.current !== null) {
        window.clearTimeout(wheelLockTimerRef.current);
      }
      wheelLockTimerRef.current = window.setTimeout(() => {
        wrapper.style.overflowX = "auto";
        wheelLockTimerRef.current = null;
      }, 440);
    };

    const onWheelNative = (event: WheelEvent) => {
      const now = performance.now();
      const { x, y } = getCanvasPoint(event.clientX, event.clientY);
      const hitPitch = findPitchRect(pitchRectsRef.current, x, y);
      const shouldLockScroll = now < wheelPitchLockUntilRef.current;
      if (!hitPitch && !shouldLockScroll) {
        return;
      }

      event.stopPropagation();
      engageWheelLock(now);
      wrapper.scrollTop = wheelLockedScrollTopRef.current;
      wrapper.scrollLeft = wheelLockedScrollLeftRef.current;
      if (!hitPitch) {
        return;
      }

      const track = tracks.find((entry) => entry.id === hitPitch.trackId);
      const note = track?.notes.find((entry) => entry.id === hitPitch.noteId);
      if (!note) {
        return;
      }

      let midi = 60;
      try {
        midi = pitchToMidi(note.pitchStr);
      } catch {
        return;
      }

      const semitone = event.deltaY < 0 ? 1 : -1;
      const nextPitch = midiToPitch(Math.max(21, Math.min(108, midi + semitone)));
      onUpdateNote(hitPitch.trackId, hitPitch.noteId, { pitchStr: nextPitch }, {
        actionKey: `track:${hitPitch.trackId}:pitch:${hitPitch.noteId}`
      });
    };

    const onScrollNative = () => {
      if (performance.now() < wheelPitchLockUntilRef.current) {
        wrapper.scrollTop = wheelLockedScrollTopRef.current;
        wrapper.scrollLeft = wheelLockedScrollLeftRef.current;
      }
    };

    wrapper.addEventListener("wheel", onWheelNative, { passive: false, capture: true });
    wrapper.addEventListener("scroll", onScrollNative, { capture: true });
    return () => {
      wrapper.removeEventListener("wheel", onWheelNative, true);
      wrapper.removeEventListener("scroll", onScrollNative, true);
      if (wheelLockTimerRef.current !== null) {
        window.clearTimeout(wheelLockTimerRef.current);
        wheelLockTimerRef.current = null;
      }
      wrapper.style.overflowX = "auto";
    };
  }, [getCanvasPoint, onUpdateNote, pitchRectsRef, tracks, wrapperRef]);
}
