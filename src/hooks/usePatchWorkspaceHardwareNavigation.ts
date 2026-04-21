"use client";

import { useEffect } from "react";
import { isModifierChord, isTextEditingTarget } from "@/hooks/hardwareNavigationUtils";
import { UseHardwareNavigationArgs } from "@/hooks/useHardwareNavigationTypes";

export function usePatchWorkspaceHardwareNavigation({
  view,
  pitchPickerOpen,
  previewPitchPickerOpen,
  previewDefaultPitchNow
}: Pick<UseHardwareNavigationArgs, "view" | "pitchPickerOpen" | "previewPitchPickerOpen" | "previewDefaultPitchNow">) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(event.target) || pitchPickerOpen || previewPitchPickerOpen) {
        return;
      }
      if (isModifierChord(event) || view !== "patch-workspace") {
        return;
      }
      if ((event.key === " " || event.code === "Space") && !event.repeat) {
        event.preventDefault();
        previewDefaultPitchNow();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pitchPickerOpen, previewPitchPickerOpen, previewDefaultPitchNow, view]);
}
