"use client";

import { useEffect } from "react";
import { isModifierChord, isTextEditingTarget } from "@/hooks/hardwareNavigationUtils";
import { UseHardwareNavigationArgs } from "@/hooks/useHardwareNavigationTypes";

export function usePatchWorkspaceHardwareNavigation({
  view,
  pitchPickerOpen,
  previewPitchPickerOpen,
  releaseHeldDefaultPitchPreview,
  startHeldDefaultPitchPreview
}: Pick<
  UseHardwareNavigationArgs,
  | "view"
  | "pitchPickerOpen"
  | "previewPitchPickerOpen"
  | "releaseHeldDefaultPitchPreview"
  | "startHeldDefaultPitchPreview"
>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isPatchWorkspacePreviewBlockedTarget(event.target) || pitchPickerOpen || previewPitchPickerOpen) {
        return;
      }
      if (isModifierChord(event) || view !== "patch-workspace") {
        return;
      }
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          startHeldDefaultPitchPreview();
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isPatchWorkspacePreviewBlockedTarget(event.target) || pitchPickerOpen || previewPitchPickerOpen) {
        return;
      }
      if ((event.key === " " || event.code === "Space") && view === "patch-workspace") {
        event.preventDefault();
        releaseHeldDefaultPitchPreview();
      }
    };

    const onBlur = () => {
      if (view === "patch-workspace") {
        releaseHeldDefaultPitchPreview();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [pitchPickerOpen, previewPitchPickerOpen, releaseHeldDefaultPitchPreview, startHeldDefaultPitchPreview, view]);
}

function isPatchWorkspacePreviewBlockedTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (element?.closest(".patch-macro-panel input[type='range']")) {
    return false;
  }
  return isTextEditingTarget(target);
}
