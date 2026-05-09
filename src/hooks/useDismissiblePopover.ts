"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

interface UseDismissiblePopoverOptions {
  active: boolean;
  capturePointerDown?: boolean;
  popoverSelector?: string;
  popoverRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}

export function useDismissiblePopover(options: UseDismissiblePopoverOptions) {
  const { active, capturePointerDown = false, popoverSelector, popoverRef, onDismiss } = options;

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
      if (target && popoverRef?.current?.contains(target)) {
        return;
      }
      if (target && popoverSelector && target.closest(popoverSelector)) {
        return;
      }
      onDismiss();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, { capture: capturePointerDown });
    return () => {
      window.clearTimeout(activateTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, { capture: capturePointerDown });
    };
  }, [active, capturePointerDown, onDismiss, popoverRef, popoverSelector]);
}
