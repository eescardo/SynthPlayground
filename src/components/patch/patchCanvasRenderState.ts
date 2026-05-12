import { PatchDiff } from "@/lib/patch/diff";
import { PatchValidationIssue } from "@/types/patch";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";
import { PatchWireTooltipBounds } from "@/components/patch/patchWireGeometry";
import { HitPort } from "@/components/patch/patchCanvasGeometry";

export interface PatchCanvasSelectionState {
  selectedNodeId?: string;
  selectedConnectionId?: string | null;
  selectedMacroNodeIds: Set<string>;
  deletePreviewNodeId?: string | null;
  deletePreviewConnectionId?: string | null;
  clearPreviewActive?: boolean;
}

export interface PatchCanvasModeState {
  structureLocked?: boolean;
  pendingProbeId?: string | null;
}

export interface PatchCanvasViewportState {
  canvasSize: { width: number; height: number };
  visibleCanvasBounds: PatchWireTooltipBounds;
  outputHostCanvasLeft: number;
  zoom: number;
}

export type PatchCanvasHoverTarget =
  | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
  | { kind: "connection"; connectionId: string }
  | null;

export interface PatchWireCandidateDisplay {
  status: "valid" | "invalid" | "replace";
  target: { nodeId: string; portId: string; portKind: "in" | "out" };
  reason?: string;
  pointer?: { x: number; y: number } | null;
  replaceSelection?: "no" | "yes";
  tooltipBounds?: PatchWireTooltipBounds;
}

export interface PatchArmedWireModuleHover {
  nodeId: string;
  nearestPort?: { nodeId: string; portId: string; kind: "in" | "out" } | null;
  cancelActionActive?: boolean;
}

export interface PatchWireCandidatePulse {
  status: "valid" | "invalid" | "replace";
  target: { nodeId: string; portId: string; portKind: "in" | "out" };
  startedAt: number;
}

export interface PatchLockedPortTooltip {
  pointer: { x: number; y: number };
  target: { nodeId: string; portId: string; portKind: "in" | "out" };
  tooltipBounds?: PatchWireTooltipBounds;
}

export interface PatchCanvasWireRenderState {
  pendingFromPort: HitPort | null;
  pendingWirePointer?: { x: number; y: number } | null;
  candidate?: PatchWireCandidateDisplay | null;
  candidatePulse?: PatchWireCandidatePulse | null;
  commitFeedback?: PatchWireCommitFeedback | null;
  feedbackNow?: number;
  lockedPortTooltip?: PatchLockedPortTooltip | null;
  armedModuleHover?: PatchArmedWireModuleHover | null;
}

export interface PatchCanvasProbeRenderState {
  pendingPointer?: { x: number; y: number } | null;
}

export interface PatchCanvasDiffRenderState {
  patchDiff: PatchDiff;
  validationIssues: PatchValidationIssue[];
}

export interface PatchCanvasRenderState {
  viewport: PatchCanvasViewportState;
  selection: PatchCanvasSelectionState;
  wire: PatchCanvasWireRenderState;
  probe: PatchCanvasProbeRenderState;
  diff: PatchCanvasDiffRenderState;
  hover: {
    nodeId: string | null;
    attachTarget: PatchCanvasHoverTarget;
  };
}
