"use client";

import { ReactNode, useState } from "react";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";

interface PatchToolbarPickerProps {
  buttonLabel: string;
  popoverAriaLabel: string;
  wrapperClassName: string;
  popoverClassName?: string;
  disabled?: boolean;
  children: ReactNode | ((controls: { close: () => void }) => ReactNode);
}

export function PatchToolbarPicker(props: PatchToolbarPickerProps) {
  const [open, setOpen] = useState(false);

  useDismissiblePopover({
    active: open,
    popoverSelector: `.${props.wrapperClassName.split(" ").join(".")}`,
    onDismiss: () => setOpen(false)
  });

  return (
    <div className={props.wrapperClassName}>
      <button type="button" disabled={props.disabled} onClick={() => setOpen((current) => !current)}>
        {props.buttonLabel}
      </button>
      {open && (
        <div
          className={`patch-toolbar-picker-popover ${props.popoverClassName ?? ""}`.trim()}
          role="dialog"
          aria-label={props.popoverAriaLabel}
        >
          {typeof props.children === "function" ? props.children({ close: () => setOpen(false) }) : props.children}
        </div>
      )}
    </div>
  );
}
