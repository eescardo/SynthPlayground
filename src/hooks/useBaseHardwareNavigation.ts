"use client";

import { useCallback, useEffect, useState } from "react";
import { KEYBOARD_NOTE_PREVIEW_MAX_PITCH, KEYBOARD_NOTE_PREVIEW_MIN_PITCH } from "@/lib/hardwareNavigation";
import { parseNoteSelectionKey } from "@/lib/clipboard";
import { transposePitch } from "@/lib/pitch";
import {
  focusLastTrackChromeTabStop,
  isModifierChord,
  isPlayheadTabStopFocused,
  isTextEditingTarget
} from "@/hooks/hardwareNavigationUtils";
import { UseHardwareNavigationArgs } from "@/hooks/useHardwareNavigationTypes";

interface UseBaseHardwareNavigationArgs extends UseHardwareNavigationArgs {
  canShiftPitchPreview: boolean;
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
  canShiftPitchPreview,
  interactionLocked,
  pitchPickerOpen,
  previewPitchPickerOpen,
  pitchPreviewPitch,
  selectionKind,
  setPitchPreviewPitch,
  setSelectedTrackId,
  setContentSelection
}: UseBaseHardwareNavigationArgs): BaseHardwareNavigationResult {
  const [playheadNavigationFocused, setPlayheadNavigationFocused] = useState(false);
  const [selectedContentTabStopFocusToken, setSelectedContentTabStopFocusToken] = useState(0);

  const returnSelectionFocusToPlayhead = useCallback(() => {
    setPlayheadNavigationFocused(true);
  }, []);

  const focusSelectedContentTabStop = useCallback(() => {
    setSelectedContentTabStopFocusToken((current) => current + 1);
  }, []);

  const setSingleNoteSelection = useCallback(
    (selectionKey: string, options?: { keepCollapsed?: boolean }) => {
      const parsed = parseNoteSelectionKey(selectionKey);
      if (!parsed) {
        return;
      }
      setSelectedTrackId(parsed.trackId);
      setContentSelection(
        {
          noteKeys: [selectionKey],
          automationKeyframeSelectionKeys: []
        },
        options
      );
    },
    [setContentSelection, setSelectedTrackId]
  );

  useEffect(() => {
    if (selectionKind === "none") {
      return;
    }
    if (!isPlayheadTabStopFocused()) {
      setPlayheadNavigationFocused(false);
    }
  }, [selectionKind]);

  useEffect(() => {
    const shiftPitchPreview = (semitones: number) => {
      const nextPitch = transposePitch(pitchPreviewPitch, semitones, {
        minPitch: KEYBOARD_NOTE_PREVIEW_MIN_PITCH,
        maxPitch: KEYBOARD_NOTE_PREVIEW_MAX_PITCH
      });
      if (nextPitch === pitchPreviewPitch) {
        return;
      }
      setPitchPreviewPitch(nextPitch);
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
      if (!canShiftPitchPreview) {
        return;
      }

      if (event.key === "-" && !event.repeat) {
        event.preventDefault();
        shiftPitchPreview(-1);
        return;
      }

      if (event.key === "=" && !event.repeat) {
        event.preventDefault();
        shiftPitchPreview(1);
        return;
      }

      if (event.key === "_" && !event.repeat) {
        event.preventDefault();
        shiftPitchPreview(-0.25);
        return;
      }

      if (event.key === "+" && !event.repeat) {
        event.preventDefault();
        shiftPitchPreview(0.25);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    canShiftPitchPreview,
    interactionLocked,
    pitchPickerOpen,
    pitchPreviewPitch,
    previewPitchPickerOpen,
    setPitchPreviewPitch
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
