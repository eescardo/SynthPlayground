"use client";

import { resolvePatchPresetStatus } from "@/lib/patch/source";
import { Patch } from "@/types/patch";

interface PatchSummaryPopoverProps {
  patch: Patch;
  invalid: boolean;
  canRemove: boolean;
  mode: "teaser" | "expanded";
  top: number;
  left: number;
  height: number;
  onExpand: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onOpenWorkspace: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function PatchCircuitThumbnail({ patch }: { patch: Patch }) {
  const nodes = patch.layout.nodes.slice(0, 10);
  if (nodes.length === 0) {
    return <div className="patch-summary-thumbnail-empty">No graph preview</div>;
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const width = Math.max(1, maxX - minX + 4);
  const height = Math.max(1, maxY - minY + 4);
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node] as const));
  const visibleConnections = patch.connections.filter((connection) => nodeById.has(connection.from.nodeId) && nodeById.has(connection.to.nodeId));

  return (
    <svg className="patch-summary-thumbnail" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {visibleConnections.map((connection) => {
        const from = nodeById.get(connection.from.nodeId);
        const to = nodeById.get(connection.to.nodeId);
        if (!from || !to) {
          return null;
        }
        return (
          <line
            key={connection.id}
            x1={from.x - minX + 1.5}
            y1={from.y - minY + 1.5}
            x2={to.x - minX + 1.5}
            y2={to.y - minY + 1.5}
            className="patch-summary-thumbnail-connection"
          />
        );
      })}
      {nodes.map((node) => (
        <rect
          key={node.nodeId}
          x={node.x - minX}
          y={node.y - minY}
          width="3"
          height="3"
          rx="0.75"
          className="patch-summary-thumbnail-node"
        />
      ))}
    </svg>
  );
}

export function PatchSummaryPopover(props: PatchSummaryPopoverProps) {
  const presetStatus = resolvePatchPresetStatus(props.patch);
  if (props.mode === "teaser") {
    return (
      <div
        className="track-patch-summary-popover teaser"
        style={{ top: `${props.top}px`, left: `${props.left}px`, height: `${props.height}px` }}
        onMouseEnter={props.onMouseEnter}
        onMouseLeave={props.onMouseLeave}
      >
        <button type="button" className="track-patch-summary-teaser-button" onClick={props.onExpand} aria-label="Open patch summary">
          &gt;&gt;
        </button>
      </div>
    );
  }

  return (
    <div
      className="track-patch-summary-popover expanded"
      style={{ top: `${props.top}px`, left: `${props.left}px`, height: `${props.height}px` }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="track-patch-summary-header">
        <div className="track-patch-summary-title">{props.patch.name}</div>
        <span className={`track-patch-summary-badge ${presetStatus}`}>{presetStatus === "custom" ? "Custom" : "Preset"}</span>
      </div>
      <div className="track-patch-summary-thumbnail-wrap">
        <PatchCircuitThumbnail patch={props.patch} />
        <div className="track-patch-summary-stats">
          <span>{props.patch.nodes.length} modules</span>
          <span>{props.patch.connections.length} connections</span>
          <span>{props.patch.ui.macros.length} macros</span>
        </div>
      </div>
      <div className="track-patch-summary-badges">
        {props.invalid && <span className="track-patch-summary-status invalid">Invalid</span>}
        {presetStatus === "preset_update_available" && <span className="track-patch-summary-status update">Update Available</span>}
        {presetStatus === "legacy_preset" && <span className="track-patch-summary-status legacy">Legacy Preset</span>}
      </div>
      <div className="track-patch-summary-actions">
        <button type="button" onClick={props.onDuplicate}>Duplicate Instrument</button>
        <button type="button" onClick={props.onRemove} disabled={!props.canRemove}>Remove Instrument</button>
        <button type="button" className="prominent-action" onClick={props.onOpenWorkspace}>Open Patch Workspace</button>
      </div>
    </div>
  );
}
