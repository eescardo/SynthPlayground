import type { RefObject } from "react";
import type { AutomationKeyframeRect } from "@/components/tracks/trackCanvasAutomationLane";
import type { LoopMarkerRect, MuteRect, PitchRect } from "@/components/tracks/trackCanvasGeometry";
import type {
  TrackCanvasAutomationActions,
  TrackCanvasNoteActions,
  TrackCanvasSelection,
  TrackCanvasSelectionActions,
  TrackCanvasTrackActions,
  TrackLayout,
  TimelineActionsPopoverRequest
} from "@/components/tracks/trackCanvasTypes";
import type { Project } from "@/types/music";

export interface NoteRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface HoveredLoopMarker {
  markerId: string;
  kind: "start" | "end";
  beat: number;
}

export interface TrackCanvasNoteDragState {
  trackId: string;
  noteId: string;
  mode: "move" | "resize";
  offsetBeats: number;
}

export type PendingCanvasAction =
  | {
      kind: "track";
      trackId: string;
      startX: number;
      startY: number;
      beat: number;
      pointerId: number;
    }
  | {
      kind: "ruler";
      startBeat: number;
      pointerId: number;
    };

export type PendingLaneAction =
  | {
      kind: "automation-keyframe";
      trackId: string;
      macroId: string;
      beat: number;
      value: number;
      startX: number;
      startY: number;
      pointerId: number;
    }
  | {
      kind: "fixed-slider";
      trackId: string;
      macroId: string;
      pointerId: number;
    };

export interface AutomationDragState {
  trackId: string;
  macroId: string;
  keyframeId: string;
  beat: number;
  side: "single" | "incoming" | "outgoing";
  boundary: "start" | "end" | null;
}

export interface TrackCanvasResolvedPointerTargets {
  automationLaneHit: unknown;
  laneHit: unknown;
  loopMarkerRect: LoopMarkerRect | null;
  muteRect: MuteRect | null;
  noteRect: NoteRect | null;
  pitchRect: PitchRect | null;
}

export const isEmptyCompositionEndHit = (
  compositionEndHit: boolean,
  rulerPlayheadHit: boolean,
  targets: TrackCanvasResolvedPointerTargets,
  automationKeyframe: AutomationKeyframeRect | null
): boolean =>
  compositionEndHit &&
  !rulerPlayheadHit &&
  !targets.noteRect &&
  !targets.pitchRect &&
  !targets.muteRect &&
  !targets.loopMarkerRect &&
  !automationKeyframe &&
  !targets.laneHit;

export interface UseTrackCanvasPointerInteractionsParams {
  canvas: {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    noteRectsRef: RefObject<NoteRect[]>;
    automationKeyframeRectsRef: RefObject<AutomationKeyframeRect[]>;
    muteRectsRef: RefObject<MuteRect[]>;
    pitchRectsRef: RefObject<PitchRect[]>;
    loopMarkerRectsRef: RefObject<LoopMarkerRect[]>;
  };
  model: {
    project: Project;
    trackLayouts: TrackLayout[];
    playheadBeat: number;
    projectEndBeat: number;
    gridBeats: number;
    defaultPitch: string;
    selection: TrackCanvasSelection;
    contentSelection:
      | {
          noteKeys: ReadonlySet<string>;
          automationKeyframeSelectionKeys: ReadonlySet<string>;
        }
      | undefined;
  };
  actions: {
    noteActions: TrackCanvasNoteActions;
    automationActions: TrackCanvasAutomationActions;
    selectionActions: TrackCanvasSelectionActions;
    trackActions: TrackCanvasTrackActions;
    onSetPlayheadBeat: (beat: number) => void;
    onRequestTimelineActionsPopover: (request: TimelineActionsPopoverRequest) => void;
  };
  geometry: {
    getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
    getTrackLayoutAtY: (y: number) => TrackLayout | null;
    beatFromX: (x: number) => number;
    beatWidth: number;
    fixedLaneValueFromX: (x: number) => number;
    headerWidth: number;
    noteResizeHandleWidth: number;
  };
}
