"use client";

import type { ComponentProps } from "react";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { QuickHelpDialog } from "@/components/QuickHelpDialog";
import { usePatchWorkspaceQuickHelpDialog } from "@/hooks/patch/usePatchWorkspaceQuickHelpDialog";
import { Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface PatchWorkspaceViewProps {
  patch: Patch;
  patches: Patch[];
  macroValues: Record<string, number>;
  previewPitch: string;
  migrationNotice?: string | null;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: ComponentProps<typeof InstrumentEditor>["validationIssues"];
  invalid?: boolean;
  canRemovePatch: boolean;
  onBackToComposer: () => void;
  onSelectPatch: (patchId: string) => void;
  onRenamePatch: (name: string) => void;
  onDuplicatePatch: () => void;
  onUpdatePreset: () => void;
  onRequestRemovePatch: () => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelectedMacro: () => void;
  onApplyOp: (op: PatchOp) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onAddMacro: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onSetMacroKeyframeCount: (macroId: string, keyframeCount: number) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export function PatchWorkspaceView(props: PatchWorkspaceViewProps) {
  const {
    closeHelp,
    colorGlossaryItems,
    generalGuidanceItems,
    helpOpen,
    keyboardShortcuts,
    mouseHelpItems,
    openHelp
  } = usePatchWorkspaceQuickHelpDialog();

  return (
    <section className="patch-workspace-shell">
      <div className="patch-workspace-header">
        <div className="patch-workspace-heading">
          <button type="button" className="patch-workspace-back-button" onClick={props.onBackToComposer}>
            Back to Composer
          </button>
          <h2>Patch Workspace</h2>
        </div>
        <button type="button" onClick={openHelp}>Help (?)</button>
      </div>

      <InstrumentEditor
        patch={props.patch}
        patches={props.patches}
        macroValues={props.macroValues}
        previewPitch={props.previewPitch}
        migrationNotice={props.migrationNotice}
        selectedNodeId={props.selectedNodeId}
        selectedMacroId={props.selectedMacroId}
        validationIssues={props.validationIssues}
        invalid={props.invalid}
        onRenamePatch={props.onRenamePatch}
        onSelectPatch={props.onSelectPatch}
        onDuplicatePatch={props.onDuplicatePatch}
        onUpdatePreset={props.onUpdatePreset}
        canRemovePatch={props.canRemovePatch}
        onRequestRemovePatch={props.onRequestRemovePatch}
        onOpenPreviewPitchPicker={props.onOpenPreviewPitchPicker}
        onPreviewNow={props.onPreviewNow}
        onSelectNode={props.onSelectNode}
        onSelectMacro={props.onSelectMacro}
        onClearSelectedMacro={props.onClearSelectedMacro}
        onApplyOp={props.onApplyOp}
        onExposeMacro={props.onExposeMacro}
        onAddMacro={props.onAddMacro}
        onRemoveMacro={props.onRemoveMacro}
        onRenameMacro={props.onRenameMacro}
        onSetMacroKeyframeCount={props.onSetMacroKeyframeCount}
        onChangeMacroValue={props.onChangeMacroValue}
      />

      <QuickHelpDialog
        keyboardShortcuts={keyboardShortcuts}
        mouseHelpItems={mouseHelpItems}
        onClose={closeHelp}
        open={helpOpen}
      >
        <div className="quick-help-section quick-help-general-guidance">
          <h4>General Guidance</h4>
          {generalGuidanceItems.map((entry) => (
            <p key={entry}>{entry}</p>
          ))}
        </div>
        <div className="quick-help-section quick-help-color-glossary">
          <h4>Module Colors</h4>
          <div className="quick-help-color-items">
            {colorGlossaryItems.map((entry) => (
              <div key={entry.label} className="quick-help-color-item">
                <span className="quick-help-color-swatch" style={{ background: entry.color }} />
                <span>
                  <strong>{entry.label}:</strong> {entry.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </QuickHelpDialog>
    </section>
  );
}
