"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@/lib/ids";
import { resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { getSignalCapabilityColor, resolveMutedPatchModuleColors } from "@/lib/patch/moduleCategories";
import { getModuleSchema, modulePalette } from "@/lib/patch/moduleRegistry";
import { makeConnectOp } from "@/lib/patch/ops";
import { PatchValidationIssue, Patch, PatchNode, PortSchema, ParamSchema, ParamValue } from "@/types/patch";
import { PatchOp } from "@/types/ops";

const GRID = 24;
const NODE_W = 204;
const NODE_H = 126;
const NODE_HIT_PADDING = 0;
const CANVAS_MIN_WIDTH = 1400;
const CANVAS_MIN_HEIGHT = 640;
const CANVAS_PADDING = 120;
const MOVE_CURSOR = "move";
const MOVE_CURSOR_ACTIVE = "grabbing";
const COLOR_CANVAS_BG = "#0c141d";
const COLOR_GRID_MAJOR = "#1b2835";
const COLOR_GRID_MINOR = "#121e28";
const COLOR_NODE_HOVER_OVERLAY = "rgba(91, 183, 255, 0.08)";
const COLOR_NODE_TITLE = "#e7f3ff";
const COLOR_NODE_SUBTITLE = "#8cb3d5";
const COLOR_PORT_LABEL = "#9ec0df";
const COLOR_CONNECTION_FALLBACK = "#c7d8e8";
const COLOR_PENDING_PORT = "#ff5d8f";
const NODE_BODY_TOP = 34;
const PORT_START_Y = 46;
const PORT_ROW_GAP = 16;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const ZOOM_WHEEL_SENSITIVITY = 0.0012;
const FACE_POPOVER_SCALE = 2.5;
const FACE_HOVER_DELAY_MS = 900;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface HitPort {
  nodeId: string;
  portId: string;
  kind: "in" | "out";
  x: number;
  y: number;
}

interface PatchEditorCanvasProps {
  patch: Patch;
  selectedNodeId?: string;
  validationIssues: PatchValidationIssue[];
  structureLocked?: boolean;
  onSelectNode: (nodeId?: string) => void;
  onApplyOp: (op: PatchOp) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
}

function getCapabilityColor(port: PortSchema): string {
  return getSignalCapabilityColor(port.capabilities[0]);
}

function formatParamFaceValue(param: ParamSchema, value: ParamValue | undefined): string {
  const resolved = value ?? param.default;
  if (param.type === "bool") {
    return resolved ? "on" : "off";
  }
  if (param.type === "enum") {
    return String(resolved);
  }
  const numeric = typeof resolved === "number" ? resolved : param.default;
  const formatted = Math.abs(numeric) >= 10 ? numeric.toFixed(1) : numeric.toFixed(2);
  return param.unit === "linear" ? formatted : `${formatted}${param.unit}`;
}

function formatBindingValue(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}

function getNumericParam(node: PatchNode, schema: ParamSchema[], paramId: string): number {
  const param = schema.find((entry) => entry.id === paramId);
  const value = node.params[paramId] ?? param?.default;
  return typeof value === "number" ? value : 0;
}

function getAdsrParamValues(node: PatchNode, schema: ParamSchema[]) {
  return {
    attack: getNumericParam(node, schema, "attack"),
    decay: getNumericParam(node, schema, "decay"),
    sustain: getNumericParam(node, schema, "sustain"),
    release: getNumericParam(node, schema, "release")
  };
}

function getBindingRangeValues(binding: Patch["ui"]["macros"][number]["bindings"][number]) {
  if (binding.map === "piecewise" && binding.points && binding.points.length > 0) {
    const values = binding.points.map((point) => point.y);
    return { low: Math.min(...values), high: Math.max(...values) };
  }
  const min = binding.min ?? 0;
  const max = binding.max ?? 1;
  return { low: Math.min(min, max), high: Math.max(min, max) };
}

function resolveAdsrMacroRangeValues(patch: Patch, node: PatchNode, schema: ParamSchema[]) {
  const low = getAdsrParamValues(node, schema);
  const high = getAdsrParamValues(node, schema);
  let hasRange = false;

  for (const macro of patch.ui.macros) {
    for (const binding of macro.bindings) {
      if (binding.nodeId !== node.id || !(binding.paramId in low)) {
        continue;
      }
      const range = getBindingRangeValues(binding);
      const paramId = binding.paramId as keyof typeof low;
      low[paramId] = Math.min(low[paramId], range.low);
      high[paramId] = Math.max(high[paramId], range.high);
      hasRange = true;
    }
  }

  return hasRange ? { low, high } : null;
}

function drawAdsrEnvelopePath(
  ctx: CanvasRenderingContext2D,
  values: { attack: number; decay: number; sustain: number; release: number },
  graph: { x: number; y: number; width: number; height: number }
) {
  const attack = Math.max(0.01, values.attack);
  const decay = Math.max(0.01, values.decay);
  const sustain = Math.max(0, Math.min(1, values.sustain));
  const release = Math.max(0.01, values.release);
  const total = attack + decay + release + 0.75;
  const ax = graph.x + (attack / total) * graph.width;
  const dx = ax + (decay / total) * graph.width;
  const sx = dx + (0.75 / total) * graph.width;
  const rx = graph.x + graph.width;
  const highY = graph.y + 6;
  const sustainY = graph.y + graph.height - 6 - sustain * (graph.height - 12);
  const baseY = graph.y + graph.height - 4;

  ctx.beginPath();
  ctx.moveTo(graph.x, baseY);
  ctx.lineTo(ax, highY);
  ctx.lineTo(dx, sustainY);
  ctx.lineTo(sx, sustainY);
  ctx.lineTo(rx, baseY);
  ctx.stroke();
}

function drawAdsrModuleFace(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graphX = x + 36;
  const graphY = y + 38;
  const graphW = NODE_W - 72;
  const graphH = 62;
  const graph = { x: graphX, y: graphY, width: graphW, height: graphH };

  ctx.strokeStyle = "rgba(231, 243, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(graphX, graphY, graphW, graphH);

  const macroRange = resolveAdsrMacroRangeValues(patch, node, schema);
  if (macroRange) {
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(151, 214, 255, 0.84)";
    drawAdsrEnvelopePath(ctx, macroRange.low, graph);
    ctx.strokeStyle = "rgba(255, 214, 145, 0.88)";
    drawAdsrEnvelopePath(ctx, macroRange.high, graph);
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  drawAdsrEnvelopePath(ctx, getAdsrParamValues(node, schema), graph);
}

function drawGenericModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number
) {
  const faceParams = schema.slice(0, 3);
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  faceParams.forEach((param, index) => {
    const py = y + 45 + index * 18;
    ctx.fillStyle = "rgba(158, 192, 223, 0.28)";
    ctx.fillRect(x + 36, py - 11, NODE_W - 72, 15);
    ctx.fillStyle = COLOR_NODE_SUBTITLE;
    ctx.fillText(`${param.label}: ${formatParamFaceValue(param, node.params[param.id])}`, x + 42, py);
  });
}

function drawModuleCard(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: NonNullable<ReturnType<typeof getModuleSchema>>,
  x: number,
  y: number,
  options: {
    hovered: boolean;
    selected: boolean;
  }
) {
  const moduleColors = resolveMutedPatchModuleColors(schema.categories);
  ctx.fillStyle = moduleColors.fill;
  ctx.fillRect(x, y, NODE_W, NODE_H);
  if (options.hovered && !options.selected) {
    ctx.fillStyle = COLOR_NODE_HOVER_OVERLAY;
    ctx.fillRect(x + 2, y + 2, NODE_W - 4, NODE_H - 4);
  }
  ctx.fillStyle = moduleColors.accent;
  ctx.globalAlpha = options.selected ? 0.24 : options.hovered ? 0.18 : 0.12;
  ctx.fillRect(x, y, NODE_W, NODE_BODY_TOP - 8);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = options.selected ? moduleColors.accent : options.hovered ? COLOR_NODE_TITLE : moduleColors.stroke;
  ctx.lineWidth = options.hovered ? 3 : 2;
  ctx.strokeRect(x, y, NODE_W, NODE_H);

  ctx.fillStyle = COLOR_NODE_TITLE;
  ctx.font = "13px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.fillText(node.typeId, x + 10, y + 18);
  const titleWidth = ctx.measureText(node.typeId).width;
  ctx.fillStyle = COLOR_NODE_SUBTITLE;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(node.id, x + 18 + titleWidth, y + 18);

  if (node.typeId === "ADSR") {
    drawAdsrModuleFace(ctx, patch, node, schema.params, x, y, moduleColors.accent);
  } else {
    drawGenericModuleFace(ctx, node, schema.params, x, y);
  }

  schema.portsIn.forEach((port, index) => {
    const py = y + PORT_START_Y + index * PORT_ROW_GAP;
    const px = x;
    ctx.fillStyle = getCapabilityColor(port);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR_PORT_LABEL;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(port.id, px + 8, py + 3);
  });

  schema.portsOut.forEach((port, index) => {
    const py = y + PORT_START_Y + index * PORT_ROW_GAP;
    const px = x + NODE_W;
    ctx.fillStyle = getCapabilityColor(port);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR_PORT_LABEL;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    const textWidth = ctx.measureText(port.id).width;
    ctx.fillText(port.id, px - 8 - textWidth, py + 3);
  });
}

function MacroBindingDetails(props: {
  patch: Patch;
  nodeId: string;
  paramId: string;
  exposedLabel: string;
  boundMacroIds: string[];
}) {
  const boundMacros = props.patch.ui.macros.filter((macro) => props.boundMacroIds.includes(macro.id));

  return (
    <>
      <button type="button" className="macro-binding-pill" disabled title={props.exposedLabel}>
        {props.exposedLabel}
      </button>
      <div className="macro-binding-details">
        {boundMacros.map((macro) =>
          macro.bindings
            .filter((binding) => binding.nodeId === props.nodeId && binding.paramId === props.paramId)
            .map((binding) => (
              <div key={binding.id} className="macro-binding-detail-card">
                <div className="macro-binding-detail-mode">
                  {binding.map === "piecewise" ? "Keyframed" : binding.map === "exp" ? "Exponential" : "Linear"}
                </div>
                {binding.map === "piecewise" && binding.points && binding.points.length >= 2 ? (
                  <>
                    <div className="macro-binding-points">
                      {binding.points.map((point, index) => (
                        <span key={`${binding.id}_${point.x}_${index}`} className="macro-binding-point-chip">
                          {point.x.toFixed(2)}:{formatBindingValue(point.y)}
                        </span>
                      ))}
                    </div>
                    <div className="macro-binding-segments">Segments: linear interpolation</div>
                  </>
                ) : (
                  <div className="macro-binding-range">
                    Range: {formatBindingValue(binding.min ?? 0)} → {formatBindingValue(binding.max ?? 1)}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    </>
  );
}

function ParamValueControl(props: {
  param: ParamSchema;
  value: ParamValue;
  disabled?: boolean;
  onChange: (value: ParamValue) => void;
}) {
  const { param, value, disabled, onChange } = props;

  if (param.type === "float") {
    return (
      <input
        type="range"
        min={param.range.min}
        max={param.range.max}
        step={(param.range.max - param.range.min) / 500}
        value={Number(value)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    );
  }

  if (param.type === "enum") {
    return (
      <select value={String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {param.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />;
}

export function PatchEditorCanvas(props: PatchEditorCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hitPortsRef = useRef<HitPort[]>([]);
  const dragLastLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const faceHoverTimerRef = useRef<number | null>(null);
  const pointerDownNodeIdRef = useRef<string | null>(null);
  const pointerMovedRef = useRef(false);
  const [newNodeType, setNewNodeType] = useState(modulePalette[0]?.typeId ?? "VCO");
  const [pendingFromPort, setPendingFromPort] = useState<HitPort | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [facePopoverNodeId, setFacePopoverNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);

  const layoutByNode = useMemo(() => {
    return new Map(props.patch.layout.nodes.map((node) => [node.nodeId, node] as const));
  }, [props.patch.layout.nodes]);

  const nodeById = useMemo(() => new Map(props.patch.nodes.map((node) => [node.id, node] as const)), [props.patch.nodes]);
  const canvasSize = useMemo(() => {
    let maxX = CANVAS_MIN_WIDTH;
    let maxY = CANVAS_MIN_HEIGHT;
    for (const layout of props.patch.layout.nodes) {
      maxX = Math.max(maxX, layout.x * GRID + NODE_W + CANVAS_PADDING);
      maxY = Math.max(maxY, layout.y * GRID + NODE_H + CANVAS_PADDING);
    }
    return { width: maxX, height: maxY };
  }, [props.patch.layout.nodes]);

  const getFacePopoverRect = useCallback((nodeId: string) => {
    const layout = layoutByNode.get(nodeId);
    if (!layout) return null;
    const width = NODE_W * FACE_POPOVER_SCALE;
    const height = NODE_H * FACE_POPOVER_SCALE;
    const centerX = layout.x * GRID + NODE_W / 2;
    const centerY = layout.y * GRID + NODE_H / 2;
    return {
      x: Math.max(8, Math.min(canvasSize.width - width - 8, centerX - width / 2)),
      y: Math.max(8, Math.min(canvasSize.height - height - 8, centerY - height / 2)),
      width,
      height
    };
  }, [canvasSize.height, canvasSize.width, layoutByNode]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvasSize;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = COLOR_CANVAS_BG;
    ctx.fillRect(0, 0, width, height);

    for (let x = 0; x < width; x += GRID) {
      ctx.strokeStyle = x % (GRID * 4) === 0 ? COLOR_GRID_MAJOR : COLOR_GRID_MINOR;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += GRID) {
      ctx.strokeStyle = y % (GRID * 4) === 0 ? COLOR_GRID_MAJOR : COLOR_GRID_MINOR;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const portPositions = new Map<string, { x: number; y: number; schema: PortSchema }>();

    props.patch.nodes.forEach((node) => {
      const schema = getModuleSchema(node.typeId);
      if (!schema) return;
      const layout = layoutByNode.get(node.id);
      if (!layout) return;

      const x = layout.x * GRID;
      const y = layout.y * GRID;

      schema.portsIn.forEach((port, index) => {
        const py = y + PORT_START_Y + index * PORT_ROW_GAP;
        const px = x;
        portPositions.set(`${node.id}:in:${port.id}`, { x: px, y: py, schema: port });
      });

      schema.portsOut.forEach((port, index) => {
        const py = y + PORT_START_Y + index * PORT_ROW_GAP;
        const px = x + NODE_W;
        portPositions.set(`${node.id}:out:${port.id}`, { x: px, y: py, schema: port });
      });
    });

    for (const connection of props.patch.connections) {
      const from = portPositions.get(`${connection.from.nodeId}:out:${connection.from.portId}`);
      const to = portPositions.get(`${connection.to.nodeId}:in:${connection.to.portId}`);
      if (!from || !to) continue;

      const commonCapability = from.schema.capabilities.find((cap) => to.schema.capabilities.includes(cap)) ?? "AUDIO";
      ctx.strokeStyle = getSignalCapabilityColor(commonCapability) ?? COLOR_CONNECTION_FALLBACK;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    props.patch.nodes.forEach((node) => {
      const schema = getModuleSchema(node.typeId);
      if (!schema) return;
      const layout = layoutByNode.get(node.id);
      if (!layout) return;

      const x = layout.x * GRID;
      const y = layout.y * GRID;

      drawModuleCard(ctx, props.patch, node, schema, x, y, {
        hovered: hoveredNodeId === node.id,
        selected: props.selectedNodeId === node.id
      });
    });

    if (pendingFromPort) {
      const portKey = `${pendingFromPort.nodeId}:out:${pendingFromPort.portId}`;
      const p = portPositions.get(portKey);
      if (p) {
        ctx.fillStyle = COLOR_PENDING_PORT;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (facePopoverNodeId) {
      const node = nodeById.get(facePopoverNodeId);
      const schema = node ? getModuleSchema(node.typeId) : undefined;
      const rect = getFacePopoverRect(facePopoverNodeId);
      if (node && schema && rect) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 12;
        ctx.fillStyle = "rgba(4, 10, 17, 0.78)";
        ctx.fillRect(rect.x - 10, rect.y - 10, rect.width + 20, rect.height + 20);
        ctx.restore();

        ctx.save();
        ctx.translate(rect.x, rect.y);
        ctx.scale(FACE_POPOVER_SCALE, FACE_POPOVER_SCALE);
        drawModuleCard(ctx, props.patch, node, schema, 0, 0, {
          hovered: false,
          selected: true
        });
        ctx.restore();
      }
    }

    hitPortsRef.current = [];
    for (const [key, value] of portPositions.entries()) {
      const [nodeId, kind, portId] = key.split(":");
      hitPortsRef.current.push({ nodeId, kind: kind as "in" | "out", portId, x: value.x, y: value.y });
    }
  }, [canvasSize, facePopoverNodeId, getFacePopoverRect, hoveredNodeId, layoutByNode, nodeById, pendingFromPort, props.patch, props.selectedNodeId]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!facePopoverNodeId || nodeById.has(facePopoverNodeId)) {
      return;
    }
    setFacePopoverNodeId(null);
  }, [facePopoverNodeId, nodeById]);

  useEffect(() => {
    if (!hoveredNodeId || dragNodeId || facePopoverNodeId === hoveredNodeId) {
      return;
    }
    faceHoverTimerRef.current = window.setTimeout(() => {
      setFacePopoverNodeId(hoveredNodeId);
    }, FACE_HOVER_DELAY_MS);
    return () => {
      if (faceHoverTimerRef.current !== null) {
        window.clearTimeout(faceHoverTimerRef.current);
        faceHoverTimerRef.current = null;
      }
    };
  }, [dragNodeId, facePopoverNodeId, hoveredNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFacePopoverNodeId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pointerToGrid = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0, rawX: 0, rawY: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const rawX = (event.clientX - rect.left) * scaleX;
    const rawY = (event.clientY - rect.top) * scaleY;
    return {
      x: Math.round(rawX / GRID),
      y: Math.round(rawY / GRID),
      rawX,
      rawY
    };
  };

  const getNodeAtPointer = (rawX: number, rawY: number): string | null => {
    for (let index = props.patch.nodes.length - 1; index >= 0; index -= 1) {
      const node = props.patch.nodes[index];
      const layout = layoutByNode.get(node.id);
      if (!layout) continue;
      const x = layout.x * GRID;
      const y = layout.y * GRID;
      if (
        rawX >= x - NODE_HIT_PADDING &&
        rawX <= x + NODE_W + NODE_HIT_PADDING &&
        rawY >= y - NODE_HIT_PADDING &&
        rawY <= y + NODE_H + NODE_HIT_PADDING
      ) {
        return node.id;
      }
    }
    return null;
  };

  const getPortAtPointer = (rawX: number, rawY: number): HitPort | null => {
    for (const port of hitPortsRef.current) {
      const dist = Math.hypot(rawX - port.x, rawY - port.y);
      if (dist <= 7) {
        return port;
      }
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = pointerToGrid(event);
    pointerDownNodeIdRef.current = null;
    pointerMovedRef.current = false;
    if (facePopoverNodeId) {
      const rect = getFacePopoverRect(facePopoverNodeId);
      const insidePopover =
        rect &&
        pos.rawX >= rect.x &&
        pos.rawX <= rect.x + rect.width &&
        pos.rawY >= rect.y &&
        pos.rawY <= rect.y + rect.height;
      if (!insidePopover) {
        setFacePopoverNodeId(null);
      } else {
        return;
      }
    }

    const hitPort = getPortAtPointer(pos.rawX, pos.rawY);

    if (hitPort) {
      if (props.structureLocked) {
        return;
      }
      if (hitPort.kind === "out") {
        setPendingFromPort(hitPort);
      } else if (hitPort.kind === "in" && pendingFromPort) {
        props.onApplyOp(makeConnectOp(pendingFromPort.nodeId, pendingFromPort.portId, hitPort.nodeId, hitPort.portId));
        setPendingFromPort(null);
      }
      return;
    }

    const hitNodeId = getNodeAtPointer(pos.rawX, pos.rawY);
    if (hitNodeId) {
      props.onSelectNode(hitNodeId);
      setDragNodeId(hitNodeId);
      pointerDownNodeIdRef.current = hitNodeId;
      pointerMovedRef.current = false;
      const layout = layoutByNode.get(hitNodeId);
      dragLastLayoutRef.current = layout ? { x: layout.x, y: layout.y } : null;
      dragPointerOffsetRef.current = layout
        ? {
            x: pos.rawX - layout.x * GRID,
            y: pos.rawY - layout.y * GRID
          }
        : null;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      props.onSelectNode(undefined);
      setPendingFromPort(null);
      pointerDownNodeIdRef.current = null;
      pointerMovedRef.current = false;
    }
  };

  const applyCanvasWheelZoom = useCallback((event: WheelEvent, anchor: { x: number; y: number }) => {
    event.preventDefault();
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }
    const currentZoom = zoomRef.current;
    const canvasX = (scrollEl.scrollLeft + anchor.x) / currentZoom;
    const canvasY = (scrollEl.scrollTop + anchor.y) / currentZoom;
    const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * ZOOM_WHEEL_SENSITIVITY), MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(nextZoom - currentZoom) < 0.001) {
      return;
    }
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      scrollEl.scrollLeft = canvasX * nextZoom - anchor.x;
      scrollEl.scrollTop = canvasY * nextZoom - anchor.y;
    });
  }, []);

  useEffect(() => {
    const rootEl = rootRef.current;
    const scrollEl = scrollRef.current;
    if (!rootEl || !scrollEl) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      const scrollRect = scrollEl.getBoundingClientRect();
      const target = event.target instanceof Node ? event.target : null;
      const isOverCanvasScroll = target ? scrollEl.contains(target) : false;
      if (!isOverCanvasScroll && !event.ctrlKey) {
        return;
      }

      const anchor = isOverCanvasScroll
        ? {
            x: event.clientX - scrollRect.left,
            y: event.clientY - scrollRect.top
          }
        : {
            x: scrollEl.clientWidth / 2,
            y: scrollEl.clientHeight / 2
          };
      applyCanvasWheelZoom(event, anchor);
    };

    rootEl.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => rootEl.removeEventListener("wheel", onWheel, { capture: true });
  }, [applyCanvasWheelZoom]);

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = pointerToGrid(event);
    const hoverPort = getPortAtPointer(pos.rawX, pos.rawY);
    const hoverNodeId = hoverPort ? null : getNodeAtPointer(pos.rawX, pos.rawY);
    setHoveredNodeId((prev) => (prev === hoverNodeId ? prev : hoverNodeId));

    if (!dragNodeId) return;
    const pointerOffset = dragPointerOffsetRef.current;
    if (!pointerOffset) return;
    const nextLayout = {
      x: Math.max(0, Math.round((pos.rawX - pointerOffset.x) / GRID)),
      y: Math.max(0, Math.round((pos.rawY - pointerOffset.y) / GRID))
    };
    if (dragLastLayoutRef.current?.x === nextLayout.x && dragLastLayoutRef.current?.y === nextLayout.y) {
      return;
    }
    dragLastLayoutRef.current = nextLayout;
    pointerMovedRef.current = true;
    props.onApplyOp({
      type: "moveNode",
      nodeId: dragNodeId,
      newLayoutPos: nextLayout
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const clickedNodeId = pointerDownNodeIdRef.current;
    const moved = pointerMovedRef.current;
    if (dragNodeId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    dragLastLayoutRef.current = null;
    dragPointerOffsetRef.current = null;
    pointerDownNodeIdRef.current = null;
    pointerMovedRef.current = false;
    setDragNodeId(null);
    if (clickedNodeId && !moved) {
      setFacePopoverNodeId(clickedNodeId);
    }
  };

  const selectedNode = props.selectedNodeId ? nodeById.get(props.selectedNodeId) : undefined;
  const selectedSchema = selectedNode ? getModuleSchema(selectedNode.typeId) : undefined;

  const exposeMacro = (paramId: string, suggestedName: string) => {
    if (!selectedNode || props.structureLocked) {
      return;
    }
    props.onExposeMacro(selectedNode.id, paramId, suggestedName);
  };

  return (
    <div className="patch-editor" ref={rootRef}>
      <div className="patch-toolbar">
        <select value={newNodeType} disabled={props.structureLocked} onChange={(e) => setNewNodeType(e.target.value)}>
          {modulePalette.map((module) => (
            <option key={module.typeId} value={module.typeId}>
              {module.typeId}
            </option>
          ))}
        </select>
        <button
          disabled={props.structureLocked}
          onClick={() => {
            if (props.structureLocked) return;
            const nodeId = createId("node");
            props.onApplyOp({
              type: "addNode",
              typeId: newNodeType,
              nodeId,
              layoutPos: { x: 3, y: 3 }
            });
            props.onSelectNode(nodeId);
          }}
        >
          Add Module
        </button>
        <button
          disabled={!props.selectedNodeId || props.structureLocked}
          onClick={() =>
            props.selectedNodeId && !props.structureLocked && props.onApplyOp({ type: "removeNode", nodeId: props.selectedNodeId })
          }
        >
          Delete Selected
        </button>
        <button
          disabled={props.structureLocked || props.patch.nodes.length === 0}
          onClick={() =>
            !props.structureLocked &&
            props.onApplyOp({
              type: "setNodeLayout",
              nodes: resolveAutoLayoutNodes(props.patch)
            })
          }
        >
          Auto-layout
        </button>
        {props.structureLocked && <span className="muted">Preset structure is locked. Move nodes for clarity or edit macros.</span>}
        {pendingFromPort && <span className="muted">Select input port to complete connection.</span>}
        <span className="patch-zoom-readout">Zoom {Math.round(zoom * 100)}%</span>
      </div>

      <div className="patch-layout">
        <div className="patch-canvas-shell">
          <div className="patch-canvas-scroll" ref={scrollRef}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              style={{
                width: `${canvasSize.width * zoom}px`,
                height: `${canvasSize.height * zoom}px`,
                cursor: dragNodeId ? MOVE_CURSOR_ACTIVE : hoveredNodeId ? MOVE_CURSOR : "default"
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={(event) => {
                onPointerUp(event);
                setHoveredNodeId(null);
                if (faceHoverTimerRef.current !== null) {
                  window.clearTimeout(faceHoverTimerRef.current);
                  faceHoverTimerRef.current = null;
                }
              }}
            />
          </div>
        </div>

        <aside className="patch-inspector">
          <h3>Inspector</h3>
          {!selectedNode && <p className="muted">Select a module to edit parameters.</p>}

          {selectedNode && selectedSchema && (
            <>
              <h4>
                {selectedNode.typeId} <small>{selectedNode.id}</small>
              </h4>
              {selectedSchema.params.map((param) => {
                const value = selectedNode.params[param.id] ?? param.default;
                const boundMacros = props.patch.ui.macros.filter((macro) =>
                  macro.bindings.some((binding) => binding.nodeId === selectedNode.id && binding.paramId === param.id)
                );
                const isExposed = boundMacros.length > 0;
                const exposedLabel =
                  boundMacros.length === 1
                    ? `Exposed as '${boundMacros[0].name}'`
                    : `Exposed as ${boundMacros.map((macro) => `'${macro.name}'`).join(", ")}`;
                return (
                  <label key={param.id} className="param-row">
                    <span>{param.label}</span>
                    {!isExposed && (
                      <ParamValueControl
                        param={param}
                        value={value}
                        disabled={props.structureLocked}
                        onChange={(nextValue) =>
                          !props.structureLocked &&
                          props.onApplyOp({
                            type: "setParam",
                            nodeId: selectedNode.id,
                            paramId: param.id,
                            value: nextValue
                          })
                        }
                      />
                    )}
                    {isExposed ? (
                      <MacroBindingDetails
                        patch={props.patch}
                        nodeId={selectedNode.id}
                        paramId={param.id}
                        exposedLabel={exposedLabel}
                        boundMacroIds={boundMacros.map((macro) => macro.id)}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={props.structureLocked}
                        onClick={() => exposeMacro(param.id, param.label)}
                      >
                        Expose Macro
                      </button>
                    )}
                  </label>
                );
              })}
            </>
          )}

          <h4>Connections</h4>
          {props.patch.connections.length === 0 && <p className="muted">No wires yet.</p>}
          {props.patch.connections.map((connection) => (
            <div key={connection.id} className="conn-row">
              <code>
                {connection.from.nodeId}.{connection.from.portId} {" -> "} {connection.to.nodeId}.{connection.to.portId}
              </code>
              <button disabled={props.structureLocked} onClick={() => !props.structureLocked && props.onApplyOp({ type: "disconnect", connectionId: connection.id })}>x</button>
            </div>
          ))}

          <h4>Validation</h4>
          {props.validationIssues.length === 0 && <p className="ok">Patch valid.</p>}
          {props.validationIssues.map((issue, index) => (
            <p key={`${issue.message}_${index}`} className={issue.level === "error" ? "error" : "warn"}>
              {issue.message}
            </p>
          ))}
        </aside>
      </div>
    </div>
  );
}
