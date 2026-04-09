"use client";

import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { getSignalCapabilityColor, resolvePatchModuleCategoryColor } from "@/lib/patch/moduleCategories";
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

const THUMBNAIL_VIEWBOX_WIDTH = 260;
const THUMBNAIL_VIEWBOX_HEIGHT = 132;
const THUMBNAIL_NODE_SIZE = 14;
const THUMBNAIL_PADDING_X = 18;
const THUMBNAIL_PADDING_Y = 16;

function PatchCircuitThumbnail({ patch }: { patch: Patch }) {
  const nodes = patch.layout.nodes.slice(0, 12);
  if (nodes.length === 0) {
    return <div className="patch-summary-thumbnail-empty">No graph preview</div>;
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const availableWidth = THUMBNAIL_VIEWBOX_WIDTH - THUMBNAIL_PADDING_X * 2 - THUMBNAIL_NODE_SIZE;
  const availableHeight = THUMBNAIL_VIEWBOX_HEIGHT - THUMBNAIL_PADDING_Y * 2 - THUMBNAIL_NODE_SIZE;
  const scale = Math.min(availableWidth / spanX, availableHeight / spanY);
  const offsetX = THUMBNAIL_PADDING_X + (availableWidth - spanX * scale) * 0.5;
  const offsetY = THUMBNAIL_PADDING_Y + (availableHeight - spanY * scale) * 0.5;
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node] as const));
  const graphNodeById = new Map(patch.nodes.map((node) => [node.id, node] as const));
  const visibleConnections = patch.connections.filter((connection) => nodeById.has(connection.from.nodeId) && nodeById.has(connection.to.nodeId));
  const projectPoint = (x: number, y: number) => ({
    x: offsetX + (x - minX) * scale,
    y: offsetY + (y - minY) * scale
  });

  return (
    <svg
      className="patch-summary-thumbnail"
      viewBox={`0 0 ${THUMBNAIL_VIEWBOX_WIDTH} ${THUMBNAIL_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {visibleConnections.map((connection) => {
        const from = nodeById.get(connection.from.nodeId);
        const to = nodeById.get(connection.to.nodeId);
        const fromNode = graphNodeById.get(connection.from.nodeId);
        if (!from || !to) {
          return null;
        }
        const fromSchema = fromNode ? getModuleSchema(fromNode.typeId) : undefined;
        const fromPort = fromSchema?.portsOut.find((port) => port.id === connection.from.portId);
        const capability = fromPort?.capabilities[0];
        const fromPoint = projectPoint(from.x, from.y);
        const toPoint = projectPoint(to.x, to.y);
        return (
          <line
            key={connection.id}
            x1={fromPoint.x + THUMBNAIL_NODE_SIZE * 0.5}
            y1={fromPoint.y + THUMBNAIL_NODE_SIZE * 0.5}
            x2={toPoint.x + THUMBNAIL_NODE_SIZE * 0.5}
            y2={toPoint.y + THUMBNAIL_NODE_SIZE * 0.5}
            stroke={getSignalCapabilityColor(capability)}
            className="patch-summary-thumbnail-connection"
          />
        );
      })}
      {nodes.map((node) => {
        const graphNode = graphNodeById.get(node.nodeId);
        const schema = graphNode ? getModuleSchema(graphNode.typeId) : undefined;
        const point = projectPoint(node.x, node.y);
        return (
          <rect
            key={node.nodeId}
            x={point.x}
            y={point.y}
            width={THUMBNAIL_NODE_SIZE}
            height={THUMBNAIL_NODE_SIZE}
            rx="3"
            fill={resolvePatchModuleCategoryColor(schema?.categories)}
            className="patch-summary-thumbnail-node"
          />
        );
      })}
    </svg>
  );
}

export function PatchSummaryPopover(props: PatchSummaryPopoverProps) {
  const presetStatus = resolvePatchPresetStatus(props.patch);
  const sourceLabel =
    presetStatus === "custom"
      ? "Custom"
      : presetStatus === "legacy_preset"
        ? "Legacy Preset"
        : presetStatus === "preset_update_available"
          ? "Preset"
          : "Preset";
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
        <div className="track-patch-summary-title-group">
          <div className="track-patch-summary-title">{props.patch.name}</div>
          <span className={`track-patch-summary-badge ${presetStatus}`}>{sourceLabel}</span>
        </div>
      </div>
      <div className="track-patch-summary-body">
        <div className="track-patch-summary-main">
          <div className="track-patch-summary-thumbnail-wrap">
            <PatchCircuitThumbnail patch={props.patch} />
          </div>
          <div className="track-patch-summary-stats">
            <span>{props.patch.nodes.length} modules</span>
            <span>{props.patch.connections.length} connections</span>
            <span>{props.patch.ui.macros.length} macros</span>
          </div>
          <div className="track-patch-summary-badges">
            {props.invalid && <span className="track-patch-summary-status invalid">Invalid</span>}
            {presetStatus === "preset_update_available" && <span className="track-patch-summary-status update">Update Available</span>}
            {presetStatus === "legacy_preset" && <span className="track-patch-summary-status legacy">Legacy Preset</span>}
          </div>
        </div>
        <div className="track-patch-summary-actions">
          <button type="button" onClick={props.onDuplicate}>Duplicate Instrument</button>
          <button type="button" onClick={props.onRemove} disabled={!props.canRemove}>Remove Instrument</button>
          <button type="button" className="prominent-action" onClick={props.onOpenWorkspace}>Open Patch Workspace</button>
        </div>
      </div>
    </div>
  );
}
