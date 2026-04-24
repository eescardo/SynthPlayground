"use client";

import { useCallback, useEffect, useState } from "react";
import {
  KEYBOARD_NOTE_PREVIEW_MAX_PITCH,
  KEYBOARD_NOTE_PREVIEW_MIN_PITCH
} from "@/lib/hardwareNavigation";
import { parseNoteSelectionKey } from "@/lib/clipboard";
import { transposePitch } from "@/lib/pitch";
import { focusLastTrackChromeTabStop, isModifierChord, isPlayheadTabStopFocused, isTextEditingTarget } from "@/hooks/hardwareNavigationUtils";
import { UseHardwareNavigationArgs } from "@/hooks/useHardwareNavigationTypes";

interface UseBaseHardwareNavigationArgs extends UseHardwareNavigationArgs {
  interactionLocked: boolean;
}

export interface BaseHardwareNavigationResult {
  playheadNavigationFocused: boolean;
  selectedContentTabStopFocusToken: number;
  returnSelectionFocusToPlayhead: () => void;
  setPlayheadNavigationFocused: (focused: boolean) => void;
  focusSelectedContentTabStop: () => void;
  setSingleNoteSelection: (selectionKey: string, options?: { keepCollapsed?: boolean }) => void;
  focusLastTrackChromeTabStop: () => boolean;
}

export function useBaseHardwareNavigation({
  interactionLocked,
  pitchPickerOpen,
  previewPitchPickerOpen,
  defaultPitch,
  selectionKind,
  setDefaultPitch,
  setSelectedTrackId,
  setContentSelection,
  previewDefaultPitchNow
}: UseBaseHardwareNavigationArgs): BaseHardwareNavigationResult {
  const [playheadNavigationFocused, setPlayheadNavigationFocused] = useState(false);
  const [selectedContentTabStopFocusToken, setSelectedContentTabStopFocusToken] = useState(0);

  const returnSelectionFocusToPlayhead = useCallback(() => {
    setPlayheadNavigationFocused(true);
  }, []);

  const focusSelectedContentTabStop = useCallback(() => {
    setSelectedContentTabStopFocusToken((current) => current + 1);
  }, []);

  const setSingleNoteSelection = useCallback((selectionKey: string, options?: { keepCollapsed?: boolean }) => {
    const parsed = parseNoteSelectionKey(selectionKey);
    if (!parsed) {
      return;
    }
    setSelectedTrackId(parsed.trackId);
    setContentSelection({
      noteKeys: [selectionKey],
      automationKeyframeSelectionKeys: []
    }, options);
  }, [setContentSelection, setSelectedTrackId]);

  useEffect(() => {
    if (selectionKind === "none") {
      return;
    }
    if (!isPlayheadTabStopFocused()) {
      setPlayheadNavigationFocused(false);
    }
  }, [selectionKind]);

  useEffect(() => {
    const shiftDefaultPitch = (semitones: number) => {
      const nextPitch = transposePitch(defaultPitch, semitones, {
        minPitch: KEYBOARD_NOTE_PREVIEW_MIN_PITCH,
        maxPitch: KEYBOARD_NOTE_PREVIEW_MAX_PITCH
      });
      if (nextPitch === defaultPitch) {
        return;
      }
      setDefaultPitch(nextPitch);
      previewDefaultPitchNow(nextPitch);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(event.target) || pitchPickerOpen || previewPitchPickerOpen) {
        return;
      }
      if (isModifierChord(event) || interactionLocked) {
        return;
      }

      if (event.key === "-" && !event.repeat) {
        event.preventDefault();
        shiftDefaultPitch(-1);
        return;
      }

      if (event.key === "=" && !event.repeat) {
        event.preventDefault();
        shiftDefaultPitch(1);
        return;
      }

      if (event.key === "_" && !event.repeat) {
        event.preventDefault();
        shiftDefaultPitch(-0.25);
        return;
      }

      if (event.key === "+" && !event.repeat) {
        event.preventDefault();
        shiftDefaultPitch(0.25);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    defaultPitch,
    interactionLocked,
    pitchPickerOpen,
    previewDefaultPitchNow,
    previewPitchPickerOpen,
    setDefaultPitch
  ]);

  return {
    playheadNavigationFocused,
    selectedContentTabStopFocusToken,
    returnSelectionFocusToPlayhead,
    setPlayheadNavigationFocused,
    focusSelectedContentTabStop,
    setSingleNoteSelection,
    focusLastTrackChromeTabStop
  };
}
