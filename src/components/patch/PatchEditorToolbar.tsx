"use client";

import { useState } from "react";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { modulePalette } from "@/lib/patch/moduleRegistry";
import { PatchWorkspaceProbeState } from "@/types/probes";

interface PatchEditorToolbarProps {
  structureLocked?: boolean;
  canClearPatch: boolean;
  patchNodeCount: number;
  selectedNodeId?: string;
  selectedProbeId?: string;
  pendingFromPort: boolean;
  pendingProbeId?: string | null;
  zoom: number;
  onAddNode: (typeId: string) => void;
  onAddProbe: (kind: PatchWorkspaceProbeState["kind"]) => void;
  onDeleteSelected: () => void;
  onClearPatch: () => void;
  onAutoLayout: () => void;
}

export function PatchEditorToolbar(props: PatchEditorToolbarProps) {
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [probePickerOpen, setProbePickerOpen] = useState(false);

  useDismissiblePopover({
    active: modulePickerOpen,
    popoverSelector: ".patch-toolbar-module-picker",
    onDismiss: () => setModulePickerOpen(false)
  });

  useDismissiblePopover({
    active: probePickerOpen,
    popoverSelector: ".patch-toolbar-probe-picker",
    onDismiss: () => setProbePickerOpen(false)
  });

  return (
    <div className="patch-toolbar">
      <div className="patch-toolbar-module-picker">
        <button type="button" disabled={props.structureLocked} onClick={() => setModulePickerOpen((open) => !open)}>
          Add Module
        </button>
        {modulePickerOpen && (
          <div className="patch-toolbar-picker-popover patch-toolbar-module-popover" role="dialog" aria-label="Add module">
            {modulePalette.map((module) => (
              <button
                key={module.typeId}
                type="button"
                onClick={() => {
                  props.onAddNode(module.typeId);
                  setModulePickerOpen(false);
                }}
              >
                {module.typeId}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="patch-toolbar-probe-picker">
        <button type="button" onClick={() => setProbePickerOpen((open) => !open)}>
          Add Probe
        </button>
        {probePickerOpen && (
          <div className="patch-toolbar-picker-popover patch-toolbar-probe-popover" role="dialog" aria-label="Add probe">
            <button type="button" onClick={() => {
              props.onAddProbe("scope");
              setProbePickerOpen(false);
            }}>
              Scope Probe
            </button>
            <button type="button" onClick={() => {
              props.onAddProbe("spectrum");
              setProbePickerOpen(false);
            }}>
              Spectrum Probe
            </button>
          </div>
        )}
      </div>
      <button
        disabled={!props.selectedProbeId && (!props.selectedNodeId || props.structureLocked)}
        onClick={props.onDeleteSelected}
      >
        Delete Selected
      </button>
      <button disabled={!props.canClearPatch || props.structureLocked} onClick={props.onClearPatch}>
        Clear
      </button>
      <button disabled={props.patchNodeCount === 0} onClick={props.onAutoLayout}>
        Auto-layout
      </button>
      {props.structureLocked && <span className="muted">Preset structure is locked. Move nodes for clarity or edit macros.</span>}
      {props.pendingFromPort && <span className="muted">Select a compatible port to complete connection.</span>}
      {props.pendingProbeId && <span className="muted">Click a port or wire to attach the selected probe.</span>}
      <span className="patch-zoom-readout">Zoom {Math.round(props.zoom * 100)}%</span>
    </div>
  );
}
