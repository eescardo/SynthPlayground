import { PatchBaselineDiffState } from "@/components/patch/patchBaselineDiffState";
import { PatchOp } from "@/types/ops";
import { Patch, PatchValidationIssue } from "@/types/patch";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";

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
