"use client";

import { useEffect } from "react";

interface UseDismissiblePopoverOptions {
  active: boolean;
  popoverSelector: string;
  onDismiss: () => void;
}

export function useDismissiblePopover(options: UseDismissiblePopoverOptions) {
  const { active, popoverSelector, onDismiss } = options;

  useEffect(() => {
    if (!active) {
      return;
    }

    let dismissEnabled = false;
    const activateTimer = window.setTimeout(() => {
      dismissEnabled = true;
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!dismissEnabled) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest(popoverSelector)) {
        return;
      }
      onDismiss();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.clearTimeout(activateTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [active, onDismiss, popoverSelector]);
}
