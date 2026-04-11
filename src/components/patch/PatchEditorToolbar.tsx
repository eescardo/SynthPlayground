"use client";

import { modulePalette } from "@/lib/patch/moduleRegistry";

interface PatchEditorToolbarProps {
  newNodeType: string;
  structureLocked?: boolean;
  patchNodeCount: number;
  selectedNodeId?: string;
  pendingFromPort: boolean;
  zoom: number;
  onChangeNewNodeType: (typeId: string) => void;
  onAddNode: () => void;
  onDeleteSelected: () => void;
  onAutoLayout: () => void;
}

export function PatchEditorToolbar(props: PatchEditorToolbarProps) {
  return (
    <div className="patch-toolbar">
      <select value={props.newNodeType} disabled={props.structureLocked} onChange={(event) => props.onChangeNewNodeType(event.target.value)}>
        {modulePalette.map((module) => (
          <option key={module.typeId} value={module.typeId}>
            {module.typeId}
          </option>
        ))}
      </select>
      <button disabled={props.structureLocked} onClick={props.onAddNode}>
        Add Module
      </button>
      <button disabled={!props.selectedNodeId || props.structureLocked} onClick={props.onDeleteSelected}>
        Delete Selected
      </button>
      <button disabled={props.patchNodeCount === 0} onClick={props.onAutoLayout}>
        Auto-layout
      </button>
      {props.structureLocked && <span className="muted">Preset structure is locked. Move nodes for clarity or edit macros.</span>}
      {props.pendingFromPort && <span className="muted">Select input port to complete connection.</span>}
      <span className="patch-zoom-readout">Zoom {Math.round(props.zoom * 100)}%</span>
    </div>
  );
}
