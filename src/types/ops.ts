// Patch transform operation types and undo/redo history state for patch editing.
export type PatchOp =
  | {
      type: "addNode";
      typeId: string;
      nodeId: string;
      initialParams?: Record<string, number | string | boolean>;
      layoutPos: { x: number; y: number };
    }
  | {
      type: "removeNode";
      nodeId: string;
    }
  | {
      type: "moveNode";
      nodeId: string;
      newLayoutPos: { x: number; y: number };
    }
  | {
      type: "setNodeLayout";
      nodes: Array<{ nodeId: string; x: number; y: number }>;
    }
  | {
      type: "setCanvasZoom";
      zoom: number;
    }
  | {
      type: "setParam";
      nodeId: string;
      paramId: string;
      value: number | string | boolean;
    }
  | {
      type: "setParamSliderRange";
      nodeId: string;
      paramId: string;
      min: number;
      max: number;
    }
  | {
      type: "setParams";
      // Apply a related group of param changes atomically so callers do not
      // have to issue multiple setParam ops that can race or overwrite each other.
      nodeId: string;
      values: Record<string, number | string | boolean>;
    }
  | {
      type: "connect";
      connectionId: string;
      fromNodeId: string;
      fromPortId: string;
      toNodeId: string;
      toPortId: string;
    }
  | {
      type: "disconnect";
      connectionId: string;
    }
  | {
      type: "addMacro";
      macroId: string;
      name: string;
      keyframeCount: number;
    }
  | {
      type: "removeMacro";
      macroId: string;
    }
  | {
      type: "bindMacro";
      macroId: string;
      bindingId: string;
      nodeId: string;
      paramId: string;
      map: "linear" | "exp" | "piecewise";
      min?: number;
      max?: number;
      points?: Array<{ x: number; y: number }>;
    }
  | {
      type: "unbindMacro";
      macroId: string;
      bindingId: string;
    }
  | {
      type: "renameMacro";
      macroId: string;
      name: string;
    }
  | {
      type: "setMacroKeyframeCount";
      macroId: string;
      keyframeCount: number;
    }
  | {
      type: "setMacroBindingKeyframeValue";
      macroId: string;
      nodeId: string;
      paramId: string;
      normalized: number;
      value: number | string | boolean;
    };

export interface PatchHistoryState<T> {
  current: T;
  past: T[];
  future: T[];
  ops: PatchOp[];
}
