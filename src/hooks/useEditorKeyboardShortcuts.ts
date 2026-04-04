"use client";

import { useEffect } from "react";
import { NoteClipboardPasteAction } from "@/hooks/useSelectionClipboardActions";

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "SELECT" || element.tagName === "TEXTAREA"));
};

interface UseEditorKeyboardShortcutsParams {
  applyNoteClipboardPaste: (pasteAction: NoteClipboardPasteAction, beat: number) => void;
  copyAllTracksInSelection: () => Promise<void>;
  cutAllTracksInSelection: () => Promise<void>;
  deleteAllTracksInSelection: () => void;
  deleteSelectedNoteSelection: () => void;
  isDeleteShortcutKey: (key: string) => boolean;
  onCloseTransientUi: () => void;
  onOpenHelp: () => void;
  playheadBeat: number;
  redoProject: () => void;
  selectedNoteCount: number;
  undoProject: () => void;
}

export function useEditorKeyboardShortcuts({
  applyNoteClipboardPaste,
  copyAllTracksInSelection,
  cutAllTracksInSelection,
  deleteAllTracksInSelection,
  deleteSelectedNoteSelection,
  isDeleteShortcutKey,
  onCloseTransientUi,
  onOpenHelp,
  playheadBeat,
  redoProject,
  selectedNoteCount,
  undoProject
}: UseEditorKeyboardShortcutsParams) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editingText = isTextEditingTarget(event.target);
      const primaryModifier = event.metaKey || event.ctrlKey;
      const lowerKey = event.key.toLowerCase();
      const isDeleteKey = isDeleteShortcutKey(event.key);

      const isHelpKey = event.key === "?" || (event.key === "/" && event.shiftKey);
      if (isHelpKey && !editingText) {
        event.preventDefault();
        onOpenHelp();
      }

      if (event.key === "Escape") {
        onCloseTransientUi();
      }

      const isUndo = primaryModifier && !event.altKey && lowerKey === "z";
      const isRedo = (primaryModifier && event.shiftKey && lowerKey === "z") || (primaryModifier && !event.shiftKey && lowerKey === "y");

      if (!editingText && isRedo) {
        event.preventDefault();
        redoProject();
        return;
      }

      if (!editingText && isUndo) {
        event.preventDefault();
        undoProject();
        return;
      }

      if (editingText) {
        return;
      }

      if (primaryModifier && event.altKey && !event.shiftKey && lowerKey === "x") {
        event.preventDefault();
        void cutAllTracksInSelection();
        return;
      }

      if (primaryModifier && event.altKey && !event.shiftKey && lowerKey === "c") {
        event.preventDefault();
        void copyAllTracksInSelection();
        return;
      }

      if (primaryModifier && event.altKey && !event.shiftKey && lowerKey === "v") {
        event.preventDefault();
        applyNoteClipboardPaste("paste-all-tracks", playheadBeat);
        return;
      }

      if (primaryModifier && event.altKey && !event.shiftKey && lowerKey === "i") {
        event.preventDefault();
        applyNoteClipboardPaste("insert-all-tracks", playheadBeat);
        return;
      }

      if (primaryModifier && event.altKey && !event.shiftKey && isDeleteKey) {
        event.preventDefault();
        deleteAllTracksInSelection();
        return;
      }

      if (primaryModifier && !event.altKey && !event.shiftKey && lowerKey === "i") {
        event.preventDefault();
        applyNoteClipboardPaste("insert", playheadBeat);
        return;
      }

      if (!primaryModifier && !event.altKey && !event.shiftKey && isDeleteKey && selectedNoteCount > 0) {
        event.preventDefault();
        deleteSelectedNoteSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    applyNoteClipboardPaste,
    copyAllTracksInSelection,
    cutAllTracksInSelection,
    deleteAllTracksInSelection,
    deleteSelectedNoteSelection,
    isDeleteShortcutKey,
    onCloseTransientUi,
    onOpenHelp,
    playheadBeat,
    redoProject,
    selectedNoteCount,
    undoProject
  ]);
}
