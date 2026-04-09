"use client";

import { useCallback, useState } from "react";
import {
  NoteClipboardPayload,
  parseNoteClipboardPayload,
  serializeNoteClipboardPayload
} from "@/lib/clipboard";

export function useNoteClipboard() {
  const [noteClipboardPayload, setNoteClipboardPayload] = useState<NoteClipboardPayload | null>(null);

  const writeClipboardPayload = useCallback(async (payload: NoteClipboardPayload) => {
    const serialized = serializeNoteClipboardPayload(payload);
    setNoteClipboardPayload(payload);

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([serialized.plainText], { type: "text/plain" }),
            "text/html": new Blob([serialized.html], { type: "text/html" })
          })
        ]);
        return;
      }
      await navigator.clipboard.writeText(serialized.plainText);
    } catch {
      // Best effort. Keyboard-driven copy/cut paths still populate the system clipboard.
    }
  }, []);

  const clearNoteClipboard = useCallback(async () => {
    setNoteClipboardPayload(null);

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([""], { type: "text/plain" }),
            "text/html": new Blob([""], { type: "text/html" })
          })
        ]);
        return;
      }
      await navigator.clipboard.writeText("");
    } catch {
      // Best effort only; some browsers restrict clipboard writes outside explicit gestures.
    }
  }, []);

  const syncNoteClipboardPayload = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      let html: string | null = null;
      let text = "";

      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (!html && item.types.includes("text/html")) {
            html = await (await item.getType("text/html")).text();
          }
          if (!text && item.types.includes("text/plain")) {
            text = await (await item.getType("text/plain")).text();
          }
        }
      }

      if (!text && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }

      setNoteClipboardPayload(parseNoteClipboardPayload(html, text));
    } catch {
      // Permission to read the clipboard is browser-dependent; keep the last known note clipboard payload.
    }
  }, []);

  return {
    clearNoteClipboard,
    noteClipboardPayload,
    setNoteClipboardPayload,
    syncNoteClipboardPayload,
    writeClipboardPayload
  };
}
