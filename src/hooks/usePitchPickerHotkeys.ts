import { useEffect } from "react";
import { keyToPitch } from "@/lib/pitch";

export function usePitchPickerHotkeys(enabled: boolean, onSelectPitch: (pitch: string) => void) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText =
        target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
      if (editingText) {
        return;
      }

      const pitch = keyToPitch(event.key);
      if (!pitch) {
        return;
      }

      event.preventDefault();
      onSelectPitch(pitch);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onSelectPitch]);
}
