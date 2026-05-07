import {
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_ADSR_MACRO_HIGH,
  PATCH_COLOR_MODULE_FACE_ROW_BG,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_FACE_POPOVER_SCALE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
} from "@/components/patch/patchCanvasConstants";
import { clamp, clamp01 } from "@/lib/numeric";
import { Patch, PatchNode, ParamSchema, ParamValue } from "@/types/patch";

export {
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_ADSR_MACRO_HIGH,
  PATCH_COLOR_MODULE_FACE_ROW_BG,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_FACE_POPOVER_SCALE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
};

export type FaceGraph = { x: number; y: number; width: number; height: number };

export type ModuleFaceRenderer = (
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string,
  options: { expanded?: boolean }
) => void;

let activeFaceStrokeScale = 1;

export function withFaceStrokeScale<T>(expanded: boolean, draw: () => T): T {
  const previousStrokeScale = activeFaceStrokeScale;
  activeFaceStrokeScale = expanded ? 1 / PATCH_FACE_POPOVER_SCALE : 1;
  try {
    return draw();
  } finally {
    activeFaceStrokeScale = previousStrokeScale;
  }
}

export function setFaceLineWidth(ctx: CanvasRenderingContext2D, width: number) {
  ctx.lineWidth = width * activeFaceStrokeScale;
}

export function formatParamFaceValue(param: ParamSchema, value: ParamValue | undefined): string {
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

export function getNumericParam(node: PatchNode, schema: ParamSchema[], paramId: string): number {
  const param = schema.find((entry) => entry.id === paramId);
  const value = node.params[paramId] ?? param?.default;
  return typeof value === "number" ? value : 0;
}

export function getStringParam(node: PatchNode, schema: ParamSchema[], paramId: string): string {
  const param = schema.find((entry) => entry.id === paramId);
  const value = node.params[paramId] ?? param?.default;
  return typeof value === "string" ? value : String(param?.default ?? "");
}

export function drawWavePath(ctx: CanvasRenderingContext2D, points: number[], graph: FaceGraph) {
  const midY = graph.y + graph.height / 2;
  const amp = graph.height * 0.34;
  ctx.beginPath();
  points.forEach((point, index) => {
    const px = graph.x + (index / Math.max(points.length - 1, 1)) * graph.width;
    const py = midY - clamp(point, -1, 1) * amp;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.stroke();
}

export function resolveConnectedInputPortIds(patch: Patch, nodeId: string) {
  return new Set(patch.connections.filter((connection) => connection.to.nodeId === nodeId).map((connection) => connection.to.portId));
}

export function formatSignedValue(value: number, digits = 2) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

export { clamp, clamp01 };
