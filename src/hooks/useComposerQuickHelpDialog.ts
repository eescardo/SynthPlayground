"use client";

import { useEffect, useMemo, useState } from "react";
import { QuickHelpShortcutSection } from "@/components/QuickHelpDialog";

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "SELECT" || element.tagName === "TEXTAREA"));
};

interface UseComposerQuickHelpDialogParams {
  allTracksModifierLabel: string;
  deleteKeyLabel: string;
  primaryModifierLabel: string;
}

export function useComposerQuickHelpDialog({
  allTracksModifierLabel,
  deleteKeyLabel,
  primaryModifierLabel
}: UseComposerQuickHelpDialogParams) {
  const [helpOpen, setHelpOpen] = useState(false);

  const mouseHelpItems = useMemo(
    () => [
      { action: "Add note", description: "Click an empty track lane when nothing is selected." },
      { action: "Select notes", description: "Drag a marquee across notes, or click an existing note." },
      { action: "Rename things", description: "Hover for a moment and then click name text, or double-click it to rename inline." },
      { action: "Move note", description: "Drag a note block horizontally." },
      { action: "Resize note", description: "Drag near the right edge of a note block." },
      { action: "Delete note", description: "Right-click a note block." },
      { action: "Change note pitch", description: "Hover the pitch label and use the mouse wheel." },
      { action: "Timeline actions", description: "Click the playhead or a loop marker to open timeline actions." }
    ],
    []
  );

  const keyboardShortcutSections = useMemo<QuickHelpShortcutSection[]>(
    () => [
      {
        title: "General",
        entries: [
          { action: "Help", shortcut: "?" },
          { action: "Play / Stop", shortcut: "Space" },
          { action: "Move Playhead", shortcut: "Left / Right" },
          { action: "Select Track", shortcut: "Up / Down" },
          { action: "Backspace Note / Rewind", shortcut: "Backspace" },
          { action: "Default Pitch", shortcut: "- / =" },
          { action: "Macro Lanes", shortcut: "[ / ]" },
          { action: "Place Note", shortcut: "Enter" },
          { action: "Select Note At Playhead", shortcut: "Tab" },
          { action: "Close Dialogs / Collapse Selection", shortcut: "Esc" }
        ]
      },
      {
        title: "Selection",
        entries: [
          { action: "Collapsed Selection Nudge", shortcut: "Left / Right" },
          { action: "Expand Collapsed Selection", shortcut: "Enter" },
          { action: "Cut Selection", shortcut: `${primaryModifierLabel}+X` },
          { action: "Copy Selection", shortcut: `${primaryModifierLabel}+C` },
          { action: "Paste Selected Track(s)", shortcut: `${primaryModifierLabel}+V` },
          { action: "Delete Selection", shortcut: deleteKeyLabel },
          { action: "Insert Selected Track(s)", shortcut: `${primaryModifierLabel}+I` },
          { action: "Cut All Tracks", shortcut: `${allTracksModifierLabel}+X` },
          { action: "Copy All Tracks", shortcut: `${allTracksModifierLabel}+C` },
          { action: "Paste All Tracks", shortcut: `${allTracksModifierLabel}+V` },
          { action: "Delete All Tracks", shortcut: `${allTracksModifierLabel}+${deleteKeyLabel}` },
          { action: "Insert All Tracks", shortcut: `${allTracksModifierLabel}+I` },
          { action: "Clear Selection", shortcut: "Esc again" }
        ]
      }
    ],
    [allTracksModifierLabel, deleteKeyLabel, primaryModifierLabel]
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
    helpOpen,
    keyboardShortcutSections,
    mouseHelpItems,
    openHelp: () => setHelpOpen(true)
  };
}
