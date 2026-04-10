"use client";

import { useMemo, useState } from "react";

interface UseQuickHelpDialogParams {
  allTracksModifierLabel: string;
  deleteKeyLabel: string;
  primaryModifierLabel: string;
}

export function useQuickHelpDialog({
  allTracksModifierLabel,
  deleteKeyLabel,
  primaryModifierLabel
}: UseQuickHelpDialogParams) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpContext, setHelpContext] = useState<"composer" | "patch-workspace">("composer");

  const composerMouseHelpItems = useMemo(
    () => [
      { action: "Add note", description: "Click an empty track lane when nothing is selected." },
      { action: "Select notes", description: "Drag a marquee across notes, or click an existing note." },
      { action: "Move note", description: "Drag a note block horizontally." },
      { action: "Resize note", description: "Drag near the right edge of a note block." },
      { action: "Delete note", description: "Right-click a note block." },
      { action: "Change note pitch", description: "Hover the pitch label and use the mouse wheel." },
      { action: "Timeline actions", description: "Click the playhead or a loop marker to open timeline actions." }
    ],
    []
  );

  const composerKeyboardShortcuts = useMemo(
    () => [
      { action: "Help", shortcut: "?" },
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
      { action: "Close Dialogs / Clear Selection", shortcut: "Esc" }
    ],
    [allTracksModifierLabel, deleteKeyLabel, primaryModifierLabel]
  );

  const patchWorkspaceKeyboardShortcuts = useMemo(() => [{ action: "Help", shortcut: "?" }], []);
  const patchWorkspaceMouseHelpItems = useMemo<Array<{ action: string; description: string }>>(() => [], []);

  const openHelp = (context: "composer" | "patch-workspace" = "composer") => {
    setHelpContext(context);
    setHelpOpen(true);
  };

  return {
    closeHelp: () => setHelpOpen(false),
    helpOpen,
    keyboardShortcuts: helpContext === "patch-workspace" ? patchWorkspaceKeyboardShortcuts : composerKeyboardShortcuts,
    mouseHelpItems: helpContext === "patch-workspace" ? patchWorkspaceMouseHelpItems : composerMouseHelpItems,
    openComposerHelp: () => openHelp("composer"),
    openPatchWorkspaceHelp: () => openHelp("patch-workspace")
  };
}
