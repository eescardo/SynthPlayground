import {
  PATCH_CANVAS_GRID,
  PATCH_COLOR_CANVAS_BG,
  PATCH_COLOR_CONNECTION_FALLBACK,
  PATCH_COLOR_GRID_MAJOR,
  PATCH_COLOR_GRID_MINOR,
  PATCH_COLOR_NODE_HOVER_OVERLAY,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_COLOR_NODE_TITLE,
  PATCH_COLOR_PENDING_PORT,
  PATCH_COLOR_PORT_LABEL,
  PATCH_FACE_POPOVER_SCALE,
  PATCH_NODE_BODY_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  PATCH_PORT_ROW_GAP,
  PATCH_PORT_START_Y
} from "@/components/patch/patchCanvasConstants";
import { CanvasRect, HitPort } from "@/components/patch/patchCanvasGeometry";
import { getSignalCapabilityColor, resolveMutedPatchModuleColors } from "@/lib/patch/moduleCategories";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch, PatchLayoutNode, PatchNode, ParamSchema, ParamValue, PortSchema } from "@/types/patch";

const getCapabilityColor = (port: PortSchema): string => getSignalCapabilityColor(port.capabilities[0]);

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
  const graphW = PATCH_NODE_WIDTH - 72;
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
    ctx.fillRect(x + 36, py - 11, PATCH_NODE_WIDTH - 72, 15);
    ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
    ctx.fillText(`${param.label}: ${formatParamFaceValue(param, node.params[param.id])}`, x + 42, py);
  });
}

export function drawPatchModuleCard(
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
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  if (options.hovered && !options.selected) {
    ctx.fillStyle = PATCH_COLOR_NODE_HOVER_OVERLAY;
    ctx.fillRect(x + 2, y + 2, PATCH_NODE_WIDTH - 4, PATCH_NODE_HEIGHT - 4);
  }
  ctx.fillStyle = moduleColors.accent;
  ctx.globalAlpha = options.selected ? 0.24 : options.hovered ? 0.18 : 0.12;
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_BODY_TOP - 8);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = options.selected ? moduleColors.accent : options.hovered ? PATCH_COLOR_NODE_TITLE : moduleColors.stroke;
  ctx.lineWidth = options.hovered ? 3 : 2;
  ctx.strokeRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);

  ctx.fillStyle = PATCH_COLOR_NODE_TITLE;
  ctx.font = "13px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.fillText(node.typeId, x + 10, y + 18);
  const titleWidth = ctx.measureText(node.typeId).width;
  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(node.id, x + 18 + titleWidth, y + 18);

  if (node.typeId === "ADSR") {
    drawAdsrModuleFace(ctx, patch, node, schema.params, x, y, moduleColors.accent);
  } else {
    drawGenericModuleFace(ctx, node, schema.params, x, y);
  }

  schema.portsIn.forEach((port, index) => {
    const py = y + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP;
    const px = x;
    ctx.fillStyle = getCapabilityColor(port);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PATCH_COLOR_PORT_LABEL;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(port.id, px + 8, py + 3);
  });

  schema.portsOut.forEach((port, index) => {
    const py = y + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP;
    const px = x + PATCH_NODE_WIDTH;
    ctx.fillStyle = getCapabilityColor(port);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PATCH_COLOR_PORT_LABEL;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    const textWidth = ctx.measureText(port.id).width;
    ctx.fillText(port.id, px - 8 - textWidth, py + 3);
  });
}

function drawPatchGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = PATCH_COLOR_CANVAS_BG;
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x < width; x += PATCH_CANVAS_GRID) {
    ctx.strokeStyle = x % (PATCH_CANVAS_GRID * 4) === 0 ? PATCH_COLOR_GRID_MAJOR : PATCH_COLOR_GRID_MINOR;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += PATCH_CANVAS_GRID) {
    ctx.strokeStyle = y % (PATCH_CANVAS_GRID * 4) === 0 ? PATCH_COLOR_GRID_MAJOR : PATCH_COLOR_GRID_MINOR;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function resolvePortPositions(patch: Patch, layoutByNode: Map<string, PatchLayoutNode>) {
  const portPositions = new Map<string, { x: number; y: number; schema: PortSchema }>();

  patch.nodes.forEach((node) => {
    const schema = getModuleSchema(node.typeId);
    if (!schema) return;
    const layout = layoutByNode.get(node.id);
    if (!layout) return;

    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;

    schema.portsIn.forEach((port, index) => {
      const py = y + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP;
      const px = x;
      portPositions.set(`${node.id}:in:${port.id}`, { x: px, y: py, schema: port });
    });

    schema.portsOut.forEach((port, index) => {
      const py = y + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP;
      const px = x + PATCH_NODE_WIDTH;
      portPositions.set(`${node.id}:out:${port.id}`, { x: px, y: py, schema: port });
    });
  });

  return portPositions;
}

function drawPatchConnections(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  portPositions: Map<string, { x: number; y: number; schema: PortSchema }>
) {
  for (const connection of patch.connections) {
    const from = portPositions.get(`${connection.from.nodeId}:out:${connection.from.portId}`);
    const to = portPositions.get(`${connection.to.nodeId}:in:${connection.to.portId}`);
    if (!from || !to) continue;

    const commonCapability = from.schema.capabilities.find((cap) => to.schema.capabilities.includes(cap)) ?? "AUDIO";
    ctx.strokeStyle = getSignalCapabilityColor(commonCapability) ?? PATCH_COLOR_CONNECTION_FALLBACK;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function drawPatchModules(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  layoutByNode: Map<string, PatchLayoutNode>,
  hoveredNodeId: string | null,
  selectedNodeId: string | undefined
) {
  patch.nodes.forEach((node) => {
    const schema = getModuleSchema(node.typeId);
    if (!schema) return;
    const layout = layoutByNode.get(node.id);
    if (!layout) return;

    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;

    drawPatchModuleCard(ctx, patch, node, schema, x, y, {
      hovered: hoveredNodeId === node.id,
      selected: selectedNodeId === node.id
    });
  });
}

function drawPendingPatchPort(
  ctx: CanvasRenderingContext2D,
  pendingFromPort: HitPort | null,
  portPositions: Map<string, { x: number; y: number; schema: PortSchema }>
) {
  if (!pendingFromPort) {
    return;
  }
  const portKey = `${pendingFromPort.nodeId}:out:${pendingFromPort.portId}`;
  const p = portPositions.get(portKey);
  if (p) {
    ctx.fillStyle = PATCH_COLOR_PENDING_PORT;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPatchFacePopover(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: NonNullable<ReturnType<typeof getModuleSchema>>,
  rect: CanvasRect
) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "rgba(4, 10, 17, 0.78)";
  ctx.fillRect(rect.x - 10, rect.y - 10, rect.width + 20, rect.height + 20);
  ctx.restore();

  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(PATCH_FACE_POPOVER_SCALE, PATCH_FACE_POPOVER_SCALE);
  drawPatchModuleCard(ctx, patch, node, schema, 0, 0, {
    hovered: false,
    selected: true
  });
  ctx.restore();
}

function buildHitPorts(portPositions: Map<string, { x: number; y: number; schema: PortSchema }>) {
  const hitPorts: HitPort[] = [];
  for (const [key, value] of portPositions.entries()) {
    const [nodeId, kind, portId] = key.split(":");
    hitPorts.push({ nodeId, kind: kind as "in" | "out", portId, x: value.x, y: value.y });
  }
  return hitPorts;
}

export function drawPatchCanvas(args: {
  canvas: HTMLCanvasElement;
  canvasSize: { width: number; height: number };
  facePopoverNodeId: string | null;
  getFacePopoverRect: (nodeId: string) => CanvasRect | null;
  hoveredNodeId: string | null;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeById: Map<string, PatchNode>;
  patch: Patch;
  pendingFromPort: HitPort | null;
  selectedNodeId?: string;
}): HitPort[] {
  const ctx = args.canvas.getContext("2d");
  if (!ctx) return [];

  const { width, height } = args.canvasSize;
  args.canvas.width = width;
  args.canvas.height = height;

  drawPatchGrid(ctx, width, height);
  const portPositions = resolvePortPositions(args.patch, args.layoutByNode);
  drawPatchConnections(ctx, args.patch, portPositions);
  drawPatchModules(ctx, args.patch, args.layoutByNode, args.hoveredNodeId, args.selectedNodeId);
  drawPendingPatchPort(ctx, args.pendingFromPort, portPositions);

  if (args.facePopoverNodeId) {
    const node = args.nodeById.get(args.facePopoverNodeId);
    const schema = node ? getModuleSchema(node.typeId) : undefined;
    const rect = args.getFacePopoverRect(args.facePopoverNodeId);
    if (node && schema && rect) {
      drawPatchFacePopover(ctx, args.patch, node, schema, rect);
    }
  }

  return buildHitPorts(portPositions);
}
