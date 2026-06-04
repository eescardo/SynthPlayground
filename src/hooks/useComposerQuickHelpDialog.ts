"use client";

import { useEffect, useMemo, useState } from "react";
import { QuickHelpShortcutSection } from "@/components/QuickHelpDialog";

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element && (element.tagName === "INPUT" || element.tagName === "SELECT" || element.tagName === "TEXTAREA")
  );
};

interface UseComposerQuickHelpDialogParams {
  allTracksModifierLabel: string;
  deleteKeyLabel: string;
  isMacPlatform: boolean;
  primaryModifierLabel: string;
}

export function useComposerQuickHelpDialog({
  allTracksModifierLabel,
  deleteKeyLabel,
  isMacPlatform,
  primaryModifierLabel
}: UseComposerQuickHelpDialogParams) {
  const [helpOpen, setHelpOpen] = useState(false);

  const mouseHelpItems = useMemo(
    () => [
      { action: "Move playhead", description: "Click the beat header or an empty track lane." },
      { action: "Add note", description: "Double-click an empty track lane." },
      { action: "Select notes", description: "Drag a marquee across notes, or click an existing note." },
      {
        action: "Rename things",
        description: "Hover for a moment and then click name text, or double-click it to rename inline."
      },
      { action: "Move note", description: "Drag a note block horizontally." },
      { action: "Resize note", description: "Drag near the right edge of a note block." },
      { action: "Delete note", description: "Right-click a note block." },
      { action: "Change note pitch", description: "Hover the pitch label and use the mouse wheel." },
      { action: "Timeline actions", description: "Click the playhead or a loop marker to open timeline actions." }
    ],
    []
  );

  const keyboardShortcutSections = useMemo<QuickHelpShortcutSection[]>(() => {
    const measureArrowShortcut = isMacPlatform ? "Opt+Arrows" : "Ctrl+Arrows";
    const measureShiftArrowShortcut = isMacPlatform ? "Opt+Shift+Arrows" : "Ctrl+Shift+Arrows";
    const boundaryShortcut = isMacPlatform ? "Cmd+Arrows" : "Home/End";

    return [
      {
        title: "General",
        entries: [
          { action: "Help", shortcut: "?" },
          { action: "Play / Stop", shortcut: "Space" },
          { action: "Move Playhead", shortcut: "Arrows" },
          { action: "Playhead By Measure", shortcut: measureArrowShortcut },
          { action: "Composition Start / End", shortcut: boundaryShortcut },
          { action: "Select Track", shortcut: "Vertical Arrows" },
          { action: "Backspace Note / Rewind", shortcut: "Backspace" },
          { action: "Default Pitch (semitone)", shortcut: "- / =" },
          { action: "Default Pitch (eighth-tone)", shortcut: "_ / +" },
          { action: "Macro Lanes", shortcut: "[ / ]" },
          { action: "Place Note", shortcut: "Enter" },
          { action: "Place Pitched Note", shortcut: "QWERTY keys" },
          { action: "Playhead / Note Tab Stops", shortcut: "Tab / Shift+Tab" },
          { action: "Close Dialogs / Selection", shortcut: "Esc" }
        ]
      },
      {
        title: "Selection",
        entries: [
          { action: "Nudge Selection", shortcut: "Arrows" },
          { action: "Selected Note By Measure", shortcut: measureArrowShortcut },
          { action: "Previous / Next Note", shortcut: "Shift+Arrows" },
          { action: "Measure-Relative Note", shortcut: measureShiftArrowShortcut },
          { action: "First / Last Note", shortcut: boundaryShortcut },
          { action: "Select Note At Playhead", shortcut: "Tab" },
          { action: "Expand Selection", shortcut: "Enter" },
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
    ];
  }, [allTracksModifierLabel, deleteKeyLabel, isMacPlatform, primaryModifierLabel]);

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
