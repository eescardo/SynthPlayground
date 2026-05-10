"use client";

import { PatchBaselineControl } from "@/components/patch/PatchBaselineControl";
import { PatchModulePalette } from "@/components/patch/PatchModulePalette";
import { PatchToolbarPicker } from "@/components/patch/PatchToolbarPicker";
import { PatchBaselineControlState } from "@/components/patch/patchBaselineDiffState";
import { PatchWorkspaceProbeState } from "@/types/probes";

interface PatchEditorToolbarProps {
  structureLocked?: boolean;
  canClearPatch: boolean;
  patchNodeCount: number;
  baselineControl: PatchBaselineControlState;
  selectedNodeId?: string;
  protectedNodeId?: string;
  selectedProbeId?: string;
  zoom: number;
  onAddNode: (typeId: string) => void;
  onAddProbe: (kind: PatchWorkspaceProbeState["kind"]) => void;
  onDeleteSelected: () => void;
  onDeletePreviewChange: (previewing: boolean) => void;
  onClearPatch: () => void;
  onClearPreviewChange: (previewing: boolean) => void;
  onAutoLayout: () => void;
}

export function PatchEditorToolbar(props: PatchEditorToolbarProps) {
  const canDeleteNode = Boolean(
    props.selectedNodeId && props.selectedNodeId !== props.protectedNodeId && !props.structureLocked
  );
  const canDeleteSelection = Boolean(props.selectedProbeId || canDeleteNode);

  return (
    <div className="patch-toolbar">
      <PatchToolbarPicker
        buttonLabel="Add Module"
        popoverAriaLabel="Add module"
        wrapperClassName="patch-toolbar-module-picker"
        popoverClassName="patch-toolbar-module-popover"
        captureDismissPointerDown
        disabled={props.structureLocked}
      >
        {({ close }) => (
          <PatchModulePalette
            onSelectModule={(typeId) => {
              props.onAddNode(typeId);
              close();
            }}
          />
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
            <button
              type="button"
              onClick={() => {
                props.onAddProbe("scope");
                close();
              }}
            >
              Scope Probe
            </button>
            <button
              type="button"
              onClick={() => {
                props.onAddProbe("spectrum");
                close();
              }}
            >
              Spectrum Probe
            </button>
            <button
              type="button"
              onClick={() => {
                props.onAddProbe("pitch_tracker");
                close();
              }}
            >
              Pitch Tracker
            </button>
          </>
        )}
      </PatchToolbarPicker>
      <button
        disabled={!canDeleteSelection}
        onClick={() => {
          props.onDeletePreviewChange(false);
          props.onDeleteSelected();
        }}
        onMouseEnter={() => props.onDeletePreviewChange(canDeleteNode)}
        onMouseLeave={() => props.onDeletePreviewChange(false)}
        onFocus={() => props.onDeletePreviewChange(canDeleteNode)}
        onBlur={() => props.onDeletePreviewChange(false)}
      >
        Delete
      </button>
      <button
        disabled={!props.canClearPatch || props.structureLocked}
        onClick={() => {
          props.onClearPreviewChange(false);
          props.onClearPatch();
        }}
        onMouseEnter={() => props.onClearPreviewChange(props.canClearPatch && !props.structureLocked)}
        onMouseLeave={() => props.onClearPreviewChange(false)}
        onFocus={() => props.onClearPreviewChange(props.canClearPatch && !props.structureLocked)}
        onBlur={() => props.onClearPreviewChange(false)}
      >
        Clear
      </button>
      <button disabled={props.patchNodeCount === 0} onClick={props.onAutoLayout}>
        Auto-layout
      </button>
      {props.structureLocked && (
        <span className="muted">Preset structure is locked. Move nodes for clarity or edit macros.</span>
      )}
      <PatchBaselineControl {...props.baselineControl} />
      <span className="patch-zoom-readout">Zoom {Math.round(props.zoom * 100)}%</span>
    </div>
  );
}
