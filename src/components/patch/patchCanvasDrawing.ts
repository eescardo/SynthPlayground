import {
  PATCH_CANVAS_GRID,
  PATCH_COLOR_CANVAS_BG,
  PATCH_COLOR_FACE_POPOVER_BACKDROP,
  PATCH_COLOR_FACE_POPOVER_SHADOW,
  PATCH_COLOR_GRID_MAJOR,
  PATCH_COLOR_GRID_MINOR,
  PATCH_COLOR_MODULE_DELETE_PREVIEW_FILL,
  PATCH_COLOR_MODULE_DELETE_PREVIEW_STROKE,
  PATCH_COLOR_MODULE_DIFF_ADDED_ACCENT,
  PATCH_COLOR_MODULE_DIFF_ADDED_FILL,
  PATCH_COLOR_MODULE_DIFF_ADDED_STROKE,
  PATCH_COLOR_MODULE_DIFF_MODIFIED_ACCENT,
  PATCH_COLOR_MODULE_DIFF_MODIFIED_FILL,
  PATCH_COLOR_MODULE_DIFF_MODIFIED_STROKE,
  PATCH_COLOR_MODULE_DIFF_PEDESTAL_FILL,
  PATCH_COLOR_MODULE_DIFF_PEDESTAL_STROKE,
  PATCH_COLOR_MODULE_MACRO_SELECTED_STROKE,
  PATCH_COLOR_NODE_HOVER_OVERLAY,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_COLOR_NODE_TITLE,
  PATCH_COLOR_PORT_LABEL_BG,
  PATCH_COLOR_PORT_LABEL_INVALID_BG,
  PATCH_COLOR_PORT_LABEL,
  PATCH_FACE_POPOVER_SCALE,
  PATCH_NODE_BODY_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
} from "@/components/patch/patchCanvasConstants";
import { resolveInvalidPortKeys } from "@/components/patch/patchCanvasValidation";
import { drawPatchModuleFaceContent } from "@/components/patch/patchModuleFaceDrawing";
import {
  CanvasRect,
  HitPort,
  resolveHostPatchPortRect,
  resolvePatchNodePortLabelRect,
  resolveOutputHostPatchPortRect
} from "@/components/patch/patchCanvasGeometry";
import {
  ResolvedPortPosition,
  drawArmedWireModuleHover,
  drawHoveredAttachTarget,
  drawLockedPortTooltip,
  drawPatchConnections,
  drawPendingPatchPort,
  drawPendingPatchWire,
  drawWireCandidate,
  drawWireCandidatePulse,
  drawWireCommitFeedback,
  drawWireStartTooltip
} from "@/components/patch/patchWireDrawing";
import { PatchCanvasRenderState } from "@/components/patch/patchCanvasRenderState";
import { SOURCE_HOST_PORT_IDS, SOURCE_HOST_PORT_TYPE_BY_ID } from "@/lib/patch/constants";
import { PatchDiff } from "@/lib/patch/diff";
import { resolveMutedPatchModuleColors } from "@/lib/patch/moduleCategories";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import {
  getPatchOutputInputPortId,
  getPatchOutputPort,
  isHostPatchPortId,
  isPatchOutputPortId
} from "@/lib/patch/ports";
import { Patch, PatchLayoutNode, PatchNode, PortSchema } from "@/types/patch";

const PATCH_DIFF_PEDESTAL_INSET = 8;
const PATCH_DIFF_PEDESTAL_RADIUS = 10;
const PATCH_DIFF_PEDESTAL_STROKE_WIDTH = 8;
const PATCH_EXPANDED_FACE_HEADER_SCALE = 1.69;

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function resolvePortLabelRect(
  port: PortSchema,
  kind: "in" | "out",
  nodeX: number,
  nodeY: number,
  index: number
): ResolvedPortPosition {
  const rect = resolvePatchNodePortLabelRect(port.id, kind, nodeX, nodeY, index);
  return {
    ...rect,
    schema: port
  };
}

export function drawPatchModuleCard(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: NonNullable<ReturnType<typeof getModuleSchema>>,
  x: number,
  y: number,
  invalidPortKeys: Set<string>,
  options: {
    diffStatus: "unchanged" | "added" | "modified";
    hovered: boolean;
    macroSelected: boolean;
    selected: boolean;
    deletePreview: boolean;
    clearPreview: boolean;
    expandedFace?: boolean;
  }
) {
  ctx.save();
  const baseAlpha = options.clearPreview ? 0.5 : 1;
  const expandedHeaderScale = options.expandedFace ? PATCH_EXPANDED_FACE_HEADER_SCALE / PATCH_FACE_POPOVER_SCALE : 1;
  const expandedStrokeScale = options.expandedFace ? 1 / PATCH_FACE_POPOVER_SCALE : 1;
  ctx.globalAlpha = baseAlpha;
  const moduleColors = resolveMutedPatchModuleColors(schema.categories);
  if (options.diffStatus === "added" || options.diffStatus === "modified") {
    const pedestalX = x - PATCH_DIFF_PEDESTAL_INSET;
    const pedestalY = y - PATCH_DIFF_PEDESTAL_INSET;
    const pedestalWidth = PATCH_NODE_WIDTH + PATCH_DIFF_PEDESTAL_INSET * 2;
    const pedestalHeight = PATCH_NODE_HEIGHT + PATCH_DIFF_PEDESTAL_INSET * 2;
    ctx.fillStyle = PATCH_COLOR_MODULE_DIFF_PEDESTAL_FILL;
    drawRoundedRectPath(ctx, pedestalX, pedestalY, pedestalWidth, pedestalHeight, PATCH_DIFF_PEDESTAL_RADIUS);
    ctx.fill();
    ctx.strokeStyle = PATCH_COLOR_MODULE_DIFF_PEDESTAL_STROKE;
    ctx.lineWidth = PATCH_DIFF_PEDESTAL_STROKE_WIDTH;
    drawRoundedRectPath(ctx, pedestalX, pedestalY, pedestalWidth, pedestalHeight, PATCH_DIFF_PEDESTAL_RADIUS);
    ctx.stroke();
  }
  ctx.fillStyle = moduleColors.fill;
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  if (options.diffStatus === "added" || options.diffStatus === "modified") {
    ctx.fillStyle =
      options.diffStatus === "added" ? PATCH_COLOR_MODULE_DIFF_ADDED_FILL : PATCH_COLOR_MODULE_DIFF_MODIFIED_FILL;
    ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  }
  if (options.macroSelected) {
    ctx.strokeStyle = PATCH_COLOR_MODULE_MACRO_SELECTED_STROKE;
    ctx.lineWidth = 3 * expandedStrokeScale;
    ctx.strokeRect(x - 4, y - 4, PATCH_NODE_WIDTH + 8, PATCH_NODE_HEIGHT + 8);
  }
  if (options.deletePreview) {
    ctx.fillStyle = PATCH_COLOR_MODULE_DELETE_PREVIEW_FILL;
    ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  }
  if (options.hovered && !options.selected) {
    ctx.fillStyle = PATCH_COLOR_NODE_HOVER_OVERLAY;
    ctx.fillRect(x + 2, y + 2, PATCH_NODE_WIDTH - 4, PATCH_NODE_HEIGHT - 4);
  }
  ctx.fillStyle =
    options.diffStatus === "added"
      ? PATCH_COLOR_MODULE_DIFF_ADDED_ACCENT
      : options.diffStatus === "modified"
        ? PATCH_COLOR_MODULE_DIFF_MODIFIED_ACCENT
        : moduleColors.accent;
  ctx.globalAlpha =
    baseAlpha * (options.selected ? 0.26 : options.hovered ? 0.2 : options.diffStatus === "unchanged" ? 0.12 : 0.18);
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, (PATCH_NODE_BODY_TOP - 8) * expandedHeaderScale);
  ctx.globalAlpha = baseAlpha;
  ctx.strokeStyle = options.deletePreview
    ? PATCH_COLOR_MODULE_DELETE_PREVIEW_STROKE
    : options.diffStatus === "added"
      ? PATCH_COLOR_MODULE_DIFF_ADDED_STROKE
      : options.diffStatus === "modified"
        ? PATCH_COLOR_MODULE_DIFF_MODIFIED_STROKE
        : options.selected
          ? moduleColors.accent
          : options.hovered
            ? PATCH_COLOR_NODE_TITLE
            : moduleColors.stroke;
  ctx.lineWidth = (options.deletePreview ? 3.5 : options.hovered ? 3 : 2) * expandedStrokeScale;
  ctx.strokeRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);

  ctx.fillStyle = PATCH_COLOR_NODE_TITLE;
  ctx.font = `${13 * expandedHeaderScale}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
  const titleY = y + 18 * expandedHeaderScale;
  ctx.fillText(node.typeId, x + 10, titleY);
  const titleWidth = ctx.measureText(node.typeId).width;
  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = `${10 * expandedHeaderScale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(node.id, x + 18 + titleWidth, titleY);

  drawPatchModuleFaceContent(ctx, patch, node, schema, x, y, moduleColors.accent, {
    expanded: options.expandedFace === true
  });

  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const drawPortLabel = (port: PortSchema, index: number, kind: "in" | "out") => {
    const rect = resolvePortLabelRect(port, kind, x, y, index);
    ctx.fillStyle = invalidPortKeys.has(`${node.id}:${kind}:${port.id}`)
      ? PATCH_COLOR_PORT_LABEL_INVALID_BG
      : PATCH_COLOR_PORT_LABEL_BG;
    ctx.fillRect(rect.x, rect.y - rect.height / 2, rect.width, rect.height);
    ctx.fillStyle = PATCH_COLOR_PORT_LABEL;
    ctx.textAlign = "center";
    ctx.fillText(port.id, rect.x + rect.width / 2, rect.y + 3);
    ctx.textAlign = "left";
  };

  if (!options.expandedFace) {
    schema.portsIn.forEach((port, index) => drawPortLabel(port, index, "in"));
    schema.portsOut.forEach((port, index) => drawPortLabel(port, index, "out"));
  }
  ctx.restore();
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

function resolvePortPositions(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  layoutByNode: Map<string, PatchLayoutNode>,
  outputHostCanvasLeft: number
) {
  const portPositions = new Map<string, ResolvedPortPosition>();
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";

  patch.nodes.forEach((node) => {
    const schema = getModuleSchema(node.typeId);
    if (!schema) return;
    if (isPatchOutputPortId(patch, node.id)) return;
    const layout = layoutByNode.get(node.id);
    if (!layout) return;

    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;

    schema.portsIn.forEach((port, index) => {
      portPositions.set(`${node.id}:in:${port.id}`, resolvePortLabelRect(port, "in", x, y, index));
    });

    schema.portsOut.forEach((port, index) => {
      portPositions.set(`${node.id}:out:${port.id}`, resolvePortLabelRect(port, "out", x, y, index));
    });
  });

  const outputPatchPort = getPatchOutputPort(patch);
  const outputInputPortId = getPatchOutputInputPortId(patch);
  const outputPort = outputPatchPort
    ? getModuleSchema(outputPatchPort.typeId)?.portsIn.find((port) => port.id === outputInputPortId)
    : undefined;
  if (outputPatchPort && outputPort) {
    const rect = resolveOutputHostPatchPortRect(outputHostCanvasLeft);
    portPositions.set(`${outputPatchPort.id}:in:${outputPort.id}`, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      anchorX: rect.x,
      anchorY: rect.y,
      schema: outputPort
    });
  }

  SOURCE_HOST_PORT_IDS.forEach((hostId) => {
    const schema = getModuleSchema(SOURCE_HOST_PORT_TYPE_BY_ID[hostId]);
    const rect = resolveHostPatchPortRect(hostId);
    const port = schema?.portsOut[0];
    if (!rect || !port) {
      return;
    }
    portPositions.set(`${hostId}:out:${port.id}`, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      anchorX: rect.x + rect.width,
      anchorY: rect.y,
      schema: port
    });
  });

  return portPositions;
}

function drawPatchModules(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  patchDiff: PatchDiff,
  layoutByNode: Map<string, PatchLayoutNode>,
  invalidPortKeys: Set<string>,
  hoveredNodeId: string | null,
  selectedMacroNodeIds: Set<string>,
  selectedNodeId: string | undefined,
  deletePreviewNodeId: string | null | undefined,
  clearPreviewActive: boolean | undefined
) {
  patch.nodes.forEach((node) => {
    const schema = getModuleSchema(node.typeId);
    if (!schema) return;
    if (isPatchOutputPortId(patch, node.id)) return;
    const layout = layoutByNode.get(node.id);
    if (!layout) return;

    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;

    drawPatchModuleCard(ctx, patch, node, schema, x, y, invalidPortKeys, {
      diffStatus: patchDiff.nodeDiffById.get(node.id)?.status ?? "unchanged",
      hovered: hoveredNodeId === node.id,
      macroSelected: selectedMacroNodeIds.has(node.id),
      selected: selectedNodeId === node.id,
      deletePreview: deletePreviewNodeId === node.id,
      clearPreview: Boolean(clearPreviewActive)
    });
  });
}

export function drawPatchFacePopover(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  patchDiff: PatchDiff,
  node: PatchNode,
  schema: NonNullable<ReturnType<typeof getModuleSchema>>,
  rect: CanvasRect,
  macroSelected: boolean,
  deletePreview: boolean,
  clearPreview: boolean
) {
  ctx.save();
  ctx.shadowColor = PATCH_COLOR_FACE_POPOVER_SHADOW;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = PATCH_COLOR_FACE_POPOVER_BACKDROP;
  ctx.fillRect(rect.x - 10, rect.y - 10, rect.width + 20, rect.height + 20);
  ctx.restore();

  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(PATCH_FACE_POPOVER_SCALE, PATCH_FACE_POPOVER_SCALE);
  drawPatchModuleCard(ctx, patch, node, schema, 0, 0, new Set<string>(), {
    diffStatus: patchDiff.nodeDiffById.get(node.id)?.status ?? "unchanged",
    hovered: false,
    macroSelected,
    selected: true,
    deletePreview,
    clearPreview,
    expandedFace: true
  });
  ctx.restore();
}

function buildHitPorts(portPositions: Map<string, ResolvedPortPosition>) {
  const hitPorts: HitPort[] = [];
  for (const [key, value] of portPositions.entries()) {
    const [nodeId, kind, portId] = key.split(":");
    if (isHostPatchPortId(nodeId)) {
      continue;
    }
    hitPorts.push({
      nodeId,
      kind: kind as "in" | "out",
      portId,
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height
    });
  }
  return hitPorts;
}

export function drawPatchCanvas(args: {
  canvas: HTMLCanvasElement;
  facePopoverNodeId: string | null;
  getFacePopoverRect: (nodeId: string) => CanvasRect | null;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeById: Map<string, PatchNode>;
  patch: Patch;
  renderState: PatchCanvasRenderState;
}): HitPort[] {
  const ctx = args.canvas.getContext("2d");
  if (!ctx) return [];

  const { viewport, selection, wire, diff, hover } = args.renderState;
  const { width, height } = viewport.canvasSize;
  args.canvas.width = width;
  args.canvas.height = height;

  drawPatchGrid(ctx, width, height);
  const portPositions = resolvePortPositions(ctx, args.patch, args.layoutByNode, viewport.outputHostCanvasLeft);
  const feedbackNow = wire.feedbackNow ?? performance.now();
  const invalidPortKeys = resolveInvalidPortKeys(diff.validationIssues);
  drawPatchConnections(
    ctx,
    args.patch,
    portPositions,
    selection.selectedConnectionId,
    selection.deletePreviewConnectionId
  );
  drawPatchModules(
    ctx,
    args.patch,
    diff.patchDiff,
    args.layoutByNode,
    invalidPortKeys,
    hover.nodeId,
    selection.selectedMacroNodeIds,
    selection.selectedNodeId,
    selection.deletePreviewNodeId,
    selection.clearPreviewActive
  );
  drawWireCommitFeedback(ctx, portPositions, wire.commitFeedback ?? null, feedbackNow);
  drawPendingPatchPort(ctx, wire.pendingFromPort, portPositions);
  drawPendingPatchWire(ctx, wire.pendingFromPort, wire.pendingWirePointer ?? null, portPositions);
  drawWireStartTooltip(
    ctx,
    wire.pendingFromPort,
    wire.pendingWirePointer ?? null,
    portPositions,
    wire.candidate?.tooltipBounds
  );
  drawArmedWireModuleHover(ctx, args.layoutByNode, portPositions, wire.armedModuleHover);
  drawWireCandidate(ctx, portPositions, wire.candidate ?? null);
  drawWireCandidatePulse(ctx, portPositions, wire.candidatePulse ?? null, feedbackNow);
  drawLockedPortTooltip(ctx, wire.lockedPortTooltip ?? null, portPositions);
  drawHoveredAttachTarget(ctx, args.patch, portPositions, hover.attachTarget ?? null);

  if (args.facePopoverNodeId) {
    const node = args.nodeById.get(args.facePopoverNodeId);
    const schema = node ? getModuleSchema(node.typeId) : undefined;
    const rect = args.getFacePopoverRect(args.facePopoverNodeId);
    if (node && schema && rect) {
      drawPatchFacePopover(
        ctx,
        args.patch,
        diff.patchDiff,
        node,
        schema,
        rect,
        selection.selectedMacroNodeIds.has(node.id),
        selection.deletePreviewNodeId === node.id,
        Boolean(selection.clearPreviewActive)
      );
    }
  }

  return buildHitPorts(portPositions);
}
