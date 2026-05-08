// Patch graph schema and compile-time/runtime metadata for modular instrument definitions.
export type SignalCapability = "AUDIO" | "CV" | "GATE";
export type ParamType = "float" | "enum" | "bool";
export type Unit = "Hz" | "s" | "dB" | "ratio" | "cents" | "linear" | "VperOct" | "ms" | "oct" | "semitones";
export type PatchModuleCategory = "source" | "mix" | "cv" | "processor" | "envelope" | "probe" | "host";

export interface ParamSmoothing {
  kind: "one_pole";
  timeMs: number;
}

export interface ParamSchemaBase {
  id: string;
  label: string;
  type: ParamType;
  default: number | string | boolean;
  doc: string;
  smoothing?: ParamSmoothing | null;
}

export interface FloatParamSchema extends ParamSchemaBase {
  type: "float";
  default: number;
  range: { min: number; max: number };
  step?: number;
  sliderMagnet?: { point: number; radius: number };
  unit: Unit;
  map?: "linear" | "exp";
}

export interface EnumParamSchema extends ParamSchemaBase {
  type: "enum";
  default: string;
  options: string[];
}

export interface BoolParamSchema extends ParamSchemaBase {
  type: "bool";
  default: boolean;
}

export type ParamSchema = FloatParamSchema | EnumParamSchema | BoolParamSchema;

export interface PortSchema {
  id: string;
  label: string;
  kind: "signal";
  capabilities: SignalCapability[];
  multiIn?: boolean;
  doc: string;
}

export interface ModuleTypeSchema {
  typeId: string;
  categories: PatchModuleCategory[];
  doc: { summary: string };
  hostOnly?: boolean;
  requiredPortIds?: {
    in?: string[];
    out?: string[];
  };
  params: ParamSchema[];
  portsIn: PortSchema[];
  portsOut: PortSchema[];
}

export type ParamValue = number | string | boolean;

export interface PatchNode {
  id: string;
  typeId: string;
  params: Record<string, ParamValue>;
}

export interface PatchPort extends PatchNode {
  label: string;
  direction?: "source" | "sink";
}

export interface PatchConnection {
  id: string;
  from: { nodeId: string; portId: string };
  to: { nodeId: string; portId: string };
}

export interface MacroCurvePoint {
  x: number;
  y: number;
}

export interface MacroBinding {
  id: string;
  nodeId: string;
  paramId: string;
  map: "linear" | "exp" | "piecewise";
  min?: number;
  max?: number;
  points?: MacroCurvePoint[];
}

export interface PatchMacro {
  id: string;
  name: string;
  keyframeCount: number;
  defaultNormalized?: number;
  bindings: MacroBinding[];
}

export interface PatchParamSliderRange {
  min: number;
  max: number;
}

export interface PatchLayoutNode {
  nodeId: string;
  x: number;
  y: number;
}

export type PatchMeta =
  | {
      source: "custom";
    }
  | {
      source: "preset";
      presetId: string;
      presetVersion: number;
    };

export interface Patch {
  schemaVersion: number;
  id: string;
  name: string;
  meta: PatchMeta;
  nodes: PatchNode[];
  ports?: PatchPort[];
  connections: PatchConnection[];
  ui: {
    macros: PatchMacro[];
    canvasZoom?: number;
    paramRanges?: Record<string, PatchParamSliderRange>;
  };
  layout: {
    nodes: PatchLayoutNode[];
  };
}

export type PatchValidationIssueLevel = "error" | "warning";

export interface PatchValidationIssue {
  level: PatchValidationIssueLevel;
  message: string;
  code?: string;
  context?: Record<string, string>;
}

export interface PatchValidationResult {
  ok: boolean;
  issues: PatchValidationIssue[];
}

export interface RuntimeSmootherState {
  current: number;
  target: number;
  alpha: number;
}

export interface CompiledNodeParam {
  schema: ParamSchema;
  value: ParamValue;
  smoother?: RuntimeSmootherState;
}

export interface CompiledNode {
  id: string;
  typeId: string;
  params: Record<string, CompiledNodeParam>;
  inputPorts: string[];
  outputPorts: string[];
}

export interface CompiledOp {
  nodeIndex: number;
  typeTag: string;
  inputs: Array<{ portId: string; sourceBufferId?: string }>;
  outputs: Array<{ portId: string; bufferId: string }>;
}

export interface CompiledPlan {
  patchId: string;
  nodeOrder: string[];
  nodes: CompiledNode[];
  ops: CompiledOp[];
  buffers: Record<string, Float32Array>;
  sampleRate: number;
  blockSize: number;
}
