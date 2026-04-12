"use client";

import type { ComponentProps } from "react";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { PatchWorkspaceTabStrip, PatchWorkspaceTabViewModel } from "@/components/patch-workspace/PatchWorkspaceTabStrip";
import { QuickHelpDialog } from "@/components/QuickHelpDialog";
import { usePatchWorkspaceQuickHelpDialog } from "@/hooks/patch/usePatchWorkspaceQuickHelpDialog";
import { Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeTarget, PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

interface PatchWorkspaceViewProps {
  patch: Patch;
  patches: Patch[];
  probes: PatchWorkspaceProbeState[];
  selectedProbeId?: string;
  previewCaptureByProbeId: Record<string, PreviewProbeCapture>;
  previewProgress: number;
  tabs: PatchWorkspaceTabViewModel[];
  activeTabId?: string;
  macroValues: Record<string, number>;
  previewPitch: string;
  migrationNotice?: string | null;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: ComponentProps<typeof InstrumentEditor>["validationIssues"];
  invalid?: boolean;
  canRemovePatch: boolean;
  onBackToComposer: () => void;
  onActivateTab: (tabId: string) => void;
  canCreateTab: boolean;
  onCreateTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
  onSelectPatch: (patchId: string) => void;
  onRenamePatch: (name: string) => void;
  onDuplicatePatch: () => void;
  onDuplicatePatchToNewTab: () => void;
  onUpdatePreset: () => void;
  onRequestRemovePatch: () => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
  onInstrumentEditorReady: (macroValues: Record<string, number>) => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectMacro: (macroId?: string) => void;
  onClearSelectedMacro: () => void;
  onApplyOp: (op: PatchOp) => void;
  onAddProbe: (kind: PatchWorkspaceProbeState["kind"]) => void;
  onMoveProbe: (probeId: string, x: number, y: number) => void;
  onSelectProbe: (probeId?: string) => void;
  onUpdateProbeTarget: (probeId: string, target?: PatchProbeTarget) => void;
  onUpdateProbeSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onDeleteSelectedProbe: () => void;
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
        <div className="patch-workspace-header-actions">
          <button type="button" onClick={openHelp}>Help (?)</button>
          <button type="button" className="preview-pitch-button" onClick={props.onOpenPreviewPitchPicker}>
            {props.previewPitch}
          </button>
          <button type="button" onClick={props.onPreviewNow}>
            Play
          </button>
        </div>
      </div>

      <div className="patch-workspace-editor-shell">
        <PatchWorkspaceTabStrip
          tabs={props.tabs}
          activeTabId={props.activeTabId}
          canCreateTab={props.canCreateTab}
          onActivateTab={props.onActivateTab}
          onCreateTab={props.onCreateTab}
          onCloseTab={props.onCloseTab}
          onRenameTab={props.onRenameTab}
        />

        <InstrumentEditor
          editorSessionKey={props.activeTabId}
          patch={props.patch}
          patches={props.patches}
          probes={props.probes}
          selectedProbeId={props.selectedProbeId}
          previewCaptureByProbeId={props.previewCaptureByProbeId}
          previewProgress={props.previewProgress}
          macroValues={props.macroValues}
          migrationNotice={props.migrationNotice}
          onReady={props.onInstrumentEditorReady}
          selectedNodeId={props.selectedNodeId}
          selectedMacroId={props.selectedMacroId}
          validationIssues={props.validationIssues}
          invalid={props.invalid}
          onRenamePatch={props.onRenamePatch}
          onSelectPatch={props.onSelectPatch}
          onDuplicatePatch={props.onDuplicatePatch}
          onDuplicatePatchToNewTab={props.onDuplicatePatchToNewTab}
          onUpdatePreset={props.onUpdatePreset}
          canRemovePatch={props.canRemovePatch}
          onRequestRemovePatch={props.onRequestRemovePatch}
          onSelectNode={props.onSelectNode}
          onSelectMacro={props.onSelectMacro}
          onClearSelectedMacro={props.onClearSelectedMacro}
          onApplyOp={props.onApplyOp}
          onAddProbe={props.onAddProbe}
          onMoveProbe={props.onMoveProbe}
          onSelectProbe={props.onSelectProbe}
          onUpdateProbeTarget={props.onUpdateProbeTarget}
          onUpdateProbeSpectrumWindow={props.onUpdateProbeSpectrumWindow}
          onDeleteSelectedProbe={props.onDeleteSelectedProbe}
          onExposeMacro={props.onExposeMacro}
          onAddMacro={props.onAddMacro}
          onRemoveMacro={props.onRemoveMacro}
          onRenameMacro={props.onRenameMacro}
          onSetMacroKeyframeCount={props.onSetMacroKeyframeCount}
          onChangeMacroValue={props.onChangeMacroValue}
        />
      </div>

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
