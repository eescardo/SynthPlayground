"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { createComposerInteraction, isReorderModeKey, type ComposerInteraction } from "@/lib/composerInteraction";

const Context = createContext<ComposerInteraction | null>(null);

export function ComposerInteractionProvider({ children }: { children: ReactNode }) {
  const [interaction] = useState(createComposerInteraction);
  useEffect(() => {
    const blockReorderEdit = (event: Event) => {
      if (interaction.getMode() !== "reordering") return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isReorderModeKey(event)) blockReorderEdit(event);
    };
    const onBlur = () => {
      if (interaction.getMode() !== "reordering") return;
      (document.activeElement as HTMLElement | null)?.blur();
      interaction.cancelReorder();
    };
    window.addEventListener("keydown", onKeyDown, true);
    // Native menu commands need the same protection as their keyboard chords.
    window.addEventListener("cut", blockReorderEdit, true);
    window.addEventListener("paste", blockReorderEdit, true);
    window.addEventListener("pointerup", interaction.releaseReorderPress);
    window.addEventListener("pointercancel", interaction.releaseReorderPress);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("cut", blockReorderEdit, true);
      window.removeEventListener("paste", blockReorderEdit, true);
      window.removeEventListener("pointerup", interaction.releaseReorderPress);
      window.removeEventListener("pointercancel", interaction.releaseReorderPress);
      window.removeEventListener("blur", onBlur);
    };
  }, [interaction]);
  return createElement(Context.Provider, { value: interaction }, children);
}

export function useComposerInteraction() {
  const interaction = useContext(Context);
  if (!interaction) throw new Error("ComposerInteractionProvider is required.");
  const mode = useSyncExternalStore(interaction.subscribe, interaction.getMode, interaction.getMode);
  return { mode, interaction };
}
