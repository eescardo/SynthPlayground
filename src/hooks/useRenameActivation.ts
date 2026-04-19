"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback } from "react";
import { useHoverArm } from "@/hooks/useHoverArm";

type RenameTriggerMouseEvent = ReactMouseEvent<HTMLElement>;
type RenameTriggerKeyboardEvent = ReactKeyboardEvent<HTMLElement>;

interface RenameTriggerOptions<T> {
  id: T;
  enabled?: boolean;
  onPlainClick?: (event: RenameTriggerMouseEvent) => void;
  onStartRename: () => void;
}

export function useRenameActivation<T>() {
  const hoverArm = useHoverArm<T>();

  const activateRename = useCallback((id: T, event: RenameTriggerMouseEvent | RenameTriggerKeyboardEvent, onStartRename: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    hoverArm.disarm(id);
    onStartRename();
  }, [hoverArm]);

  const getRenameTriggerProps = useCallback(({ id, enabled = true, onPlainClick, onStartRename }: RenameTriggerOptions<T>) => ({
    onMouseEnter: () => {
      if (enabled) {
        hoverArm.arm(id);
      }
    },
    onMouseLeave: () => {
      hoverArm.disarm(id);
    },
    onClick: (event: RenameTriggerMouseEvent) => {
      if (enabled && hoverArm.isArmed(id)) {
        activateRename(id, event, onStartRename);
        return;
      }
      onPlainClick?.(event);
    },
    onDoubleClick: (event: RenameTriggerMouseEvent) => {
      if (enabled) {
        activateRename(id, event, onStartRename);
      }
    },
    onKeyDown: (event: RenameTriggerKeyboardEvent) => {
      if (enabled && (event.key === "Enter" || event.key === " ")) {
        activateRename(id, event, onStartRename);
      }
    }
  }), [activateRename, hoverArm]);

  return {
    getRenameTriggerProps,
    isArmed: hoverArm.isArmed
  };
}
