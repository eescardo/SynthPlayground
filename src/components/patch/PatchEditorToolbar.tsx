"use client";

import { PatchToolbarPicker } from "@/components/patch/PatchToolbarPicker";
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
  return (
    <div className="patch-toolbar">
      <PatchToolbarPicker
        buttonLabel="Add Module"
        popoverAriaLabel="Add module"
        wrapperClassName="patch-toolbar-module-picker"
        popoverClassName="patch-toolbar-module-popover"
        disabled={props.structureLocked}
      >
        {({ close }) => (
          <>
            {modulePalette.map((module) => (
              <button
                key={module.typeId}
                type="button"
                onClick={() => {
                  props.onAddNode(module.typeId);
                  close();
                }}
              >
                {module.typeId}
              </button>
            ))}
          </>
        )}
      </PatchToolbarPicker>
      <PatchToolbarPicker
        buttonLabel="Add Probe"
        popoverAriaLabel="Add probe"
        wrapperClassName="patch-toolbar-probe-picker"
        popoverClassName="patch-toolbar-probe-popover"
      >
        {({ close }) => (
          <>
            <button type="button" onClick={() => {
              props.onAddProbe("scope");
              close();
            }}>
              Scope Probe
            </button>
            <button type="button" onClick={() => {
              props.onAddProbe("spectrum");
              close();
            }}>
              Spectrum Probe
            </button>
            <button type="button" onClick={() => {
              props.onAddProbe("pitch_tracker");
              close();
            }}>
              Pitch Tracker
            </button>
          </>
        )}
      </PatchToolbarPicker>
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
