"use client";

import { useState } from "react";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { Patch } from "@/types/patch";

interface PatchBaselineControlProps {
  baselinePatch?: Patch;
  currentPatchId: string;
  hasPatchDiff: boolean;
  patches: Patch[];
  onSelectBaselinePatch: (patchId: string) => void;
  onClearBaselinePatch: () => void;
}

export function PatchBaselineControl(props: PatchBaselineControlProps) {
  const [open, setOpen] = useState(false);
  const wrapperClassName = "patch-baseline-control";

  useDismissiblePopover({
    active: open,
    popoverSelector: `.${wrapperClassName}`,
    onDismiss: () => setOpen(false)
  });

  return (
    <div className={`${wrapperClassName}${props.hasPatchDiff ? " changed" : ""}`}>
      <span className="patch-baseline-label">Baseline</span>
      <span className="patch-baseline-name" title={props.baselinePatch ? `Baseline patch: ${props.baselinePatch.name}` : "No baseline patch"}>
        {props.baselinePatch?.name ?? "None"}
      </span>
      <button type="button" className="patch-baseline-action" onClick={() => setOpen((current) => !current)}>
        {props.baselinePatch ? "Update" : "Set"}
      </button>
      {props.baselinePatch && (
        <button type="button" className="patch-baseline-action danger" onClick={props.onClearBaselinePatch}>
          Remove
        </button>
      )}
      {open && (
        <div className="patch-baseline-popover" role="dialog" aria-label="Select baseline patch">
          <div className="patch-baseline-popover-title">Select baseline patch</div>
          <div className="patch-baseline-option-list">
            {props.patches.map((patch) => {
              const isCurrentPatch = patch.id === props.currentPatchId;
              const isSelectedBaseline = patch.id === props.baselinePatch?.id;
              return (
                <button
                  key={patch.id}
                  type="button"
                  className={`patch-baseline-option${isSelectedBaseline ? " selected" : ""}`}
                  onClick={() => {
                    props.onSelectBaselinePatch(patch.id);
                    setOpen(false);
                  }}
                >
                  <span className="patch-baseline-option-name">{patch.name}</span>
                  <span className="patch-baseline-option-meta">
                    {isCurrentPatch ? "Current patch" : patch.meta.source === "preset" ? "Preset" : "Custom"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
