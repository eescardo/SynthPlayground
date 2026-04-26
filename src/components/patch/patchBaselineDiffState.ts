import { PatchDiff } from "@/lib/patch/diff";
import { Patch } from "@/types/patch";

export interface PatchBaselineDiffState {
  baselinePatch?: Patch;
  patchDiff: PatchDiff;
  availablePatches: Patch[];
  onSelectBaselinePatch: (patchId: string) => void;
  onClearBaselinePatch: () => void;
}

export interface PatchBaselineControlState extends PatchBaselineDiffState {
  currentPatchId: string;
}
