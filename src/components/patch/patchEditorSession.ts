import { PatchBaselineDiffState } from "@/components/patch/patchBaselineDiffState";
import { PatchDiff } from "@/lib/patch/diff";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { PatchOp } from "@/types/ops";
import { Patch, PatchNode, PatchValidationIssue } from "@/types/patch";
import {
  PatchProbeEditorActions,
  PatchProbeEditorState,
  PatchWorkspaceProbeState,
  PreviewProbeCapture
} from "@/types/probes";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";

export interface PatchEditorSessionModel {
  patch: Patch;
  baselineDiff: PatchBaselineDiffState;
  probeState: PatchProbeEditorState;
  macroValues: Record<string, number>;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: PatchValidationIssue[];
  invalid?: boolean;
  migrationNotice?: string | null;
  patchEditError?: string | null;
  structureLocked?: boolean;
}

export interface PatchEditorSessionActions {
  onReady?: (macroValues: Record<string, number>) => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelectedMacro: () => void;
  onClearPatch: () => void;
  onApplyOp: (op: PatchOp) => void;
  probeActions: PatchProbeEditorActions;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onAddMacro: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onSetMacroKeyframeCount: (macroId: string, keyframeCount: number) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export interface PatchEditorSession {
  editorSessionKey?: string;
  model: PatchEditorSessionModel;
  actions: PatchEditorSessionActions;
}

export interface PatchEditorStageModel {
  patch: Patch;
  baselineDiff: PatchBaselineDiffState;
  validationIssues: PatchValidationIssue[];
  probeState: PatchProbeEditorState;
  selectedNodeId?: string;
  selectedConnectionId?: string;
  selectedMacroNodeIds: Set<string>;
  structureLocked?: boolean;
}

export interface PatchEditorStageActions {
  onClearPatch: () => void;
  onApplyOp: (op: PatchOp) => void;
  probeActions: PatchProbeEditorActions;
  onSelectNode: (nodeId?: string) => void;
  onSelectConnection: (connectionId?: string) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onCancelAttachProbe: () => void;
  onWireCommitFeedback?: (feedback: PatchWireCommitFeedback) => void;
}

export interface PatchMacroPanelModel {
  patch: Patch;
  patchDiff: PatchDiff;
  macroValues: Record<string, number>;
  validationIssues: PatchValidationIssue[];
  selectedMacroId?: string;
  structureLocked?: boolean;
}

export interface PatchMacroPanelActions {
  onAddMacro: () => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelection: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onSetMacroKeyframeCount: (macroId: string, keyframeCount: number) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export interface PatchInspectorModel {
  patch: Patch;
  patchDiff: PatchDiff;
  macroValues: Record<string, number>;
  selectedNode?: PatchNode;
  selectedProbe?: PatchWorkspaceProbeState;
  selectedMacroId?: string;
  selectedSchema?: NonNullable<ReturnType<typeof getModuleSchema>>;
  previewCapture?: PreviewProbeCapture;
  previewProgress: number;
  attachingProbeId?: string | null;
  wireCommitFeedback?: PatchWireCommitFeedback | null;
  selectedConnectionId?: string;
  structureLocked?: boolean;
  validationIssues: PatchValidationIssue[];
}

export interface PatchInspectorActions {
  onApplyOp: (op: PatchOp) => void;
  onPreviewParamValue?: (nodeId: string, paramId: string, value: PatchNode["params"][string]) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
  onUpdateProbeSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onUpdateProbeFrequencyView: (probeId: string, maxHz: number) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onClearProbeTarget: (probeId: string) => void;
}
