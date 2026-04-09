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

  const keyboardShortcuts = useMemo(
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

  return {
    closeHelp: () => setHelpOpen(false),
    helpOpen,
    keyboardShortcuts,
    openHelp: () => setHelpOpen(true)
  };
}
