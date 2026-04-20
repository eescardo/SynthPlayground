"use client";

import { useEffect, useMemo, useState } from "react";
import { PATCH_MODULE_CATEGORY_COLORS } from "@/lib/patch/moduleCategories";

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "SELECT" || element.tagName === "TEXTAREA"));
};

export function usePatchWorkspaceQuickHelpDialog() {
  const [helpOpen, setHelpOpen] = useState(false);

  const keyboardShortcuts = useMemo(
    () => [
      { action: "Preview current tab", shortcut: "Space" },
      { action: "Default pitch", shortcut: "- / =" },
      { action: "Next tab", shortcut: "Ctrl+`" },
      { action: "Previous tab", shortcut: "Ctrl+Shift+`" },
      { action: "Help", shortcut: "?" }
    ],
    []
  );
  const mouseHelpItems = useMemo<Array<{ action: string; description: string }>>(
    () => [
      { action: "Zoom canvas", description: "Use a trackpad pinch or notched mouse wheel over the patch canvas. Two-finger trackpad scroll pans." },
      { action: "Inspect module face", description: "Click a module to open the expanded module face." },
      {
        action: "Rename tabs or instruments",
        description: "Double-click the visible name text, or hover for a moment and then single-click to rename inline."
      }
    ],
    []
  );
  const generalGuidanceItems = useMemo(
    () => [
      "Macro selections are sticky. Click a macro to keep it selected, press Esc or use Clear to drop it.",
      "In custom patches, macro-bound parameters unlock only when the selected macro slider is parked on a keyframe notch.",
      "Selecting a macro outlines every participating module in amber so you can see its footprint across the patch.",
      "Click either an input or output port to start wiring.",
      "Red ports are required connections that are still missing."
    ],
    []
  );
  const colorGlossaryItems = useMemo(
    () => [
      { label: "Source", color: PATCH_MODULE_CATEGORY_COLORS.source, description: "oscillators, noise, and resonant sound generators" },
      { label: "Mix", color: PATCH_MODULE_CATEGORY_COLORS.mix, description: "audio and CV mixers" },
      { label: "CV", color: PATCH_MODULE_CATEGORY_COLORS.cv, description: "control-voltage math and pitch shaping" },
      { label: "Processor", color: PATCH_MODULE_CATEGORY_COLORS.processor, description: "filters, VCAs, saturation, and other signal processors" },
      { label: "Envelope", color: PATCH_MODULE_CATEGORY_COLORS.envelope, description: "time-shaped CV or gate responses" },
      { label: "Host", color: PATCH_MODULE_CATEGORY_COLORS.host, description: "app-owned patch inputs and outputs" }
    ],
    []
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isHelpKey = event.key === "?" || (event.key === "/" && event.shiftKey);
      if (isHelpKey && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        setHelpOpen(true);
      } else if (event.key === "Escape") {
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    closeHelp: () => setHelpOpen(false),
    colorGlossaryItems,
    generalGuidanceItems,
    helpOpen,
    keyboardShortcuts,
    mouseHelpItems,
    openHelp: () => setHelpOpen(true)
  };
}
