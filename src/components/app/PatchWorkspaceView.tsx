"use client";

import type { ComponentProps, RefObject } from "react";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { BackArrowIcon } from "@/components/branding/SiteBrand";
import { ProjectsMenu } from "@/components/composer/ProjectsMenu";
import { PatchWorkspaceTabStrip, PatchWorkspaceTabViewModel } from "@/components/patch-workspace/PatchWorkspaceTabStrip";
import { QuickHelpDialog } from "@/components/QuickHelpDialog";
import { usePatchWorkspaceQuickHelpDialog } from "@/hooks/patch/usePatchWorkspaceQuickHelpDialog";
import { RecentProjectSnapshot } from "@/lib/persistence";
import { Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";

interface PatchWorkspaceViewProps {
  patch: Patch;
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  probeState: PatchProbeEditorState;
  tabs: PatchWorkspaceTabViewModel[];
  activeTabId?: string;
  macroValues: Record<string, number>;
  previewPitch: string;
  migrationNotice?: string | null;
  selectedNodeId?: string;
  selectedMacroId?: string;
  validationIssues: ComponentProps<typeof InstrumentEditor>["validationIssues"];
  invalid?: boolean;
  onBackToComposer: () => void;
  onActivateTab: (tabId: string) => void;
  canCreateTab: boolean;
  onCreateTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
  onNewProject: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
  onInstrumentEditorReady: (macroValues: Record<string, number>) => void;
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
          <ProjectsMenu
            className="patch-workspace-projects-menu"
            iconOnly
            triggerLabel="Projects"
            importInputRef={props.importInputRef}
            recentProjects={props.recentProjects}
            onNewProject={props.onNewProject}
            onExportJson={props.onExportJson}
            onImportJson={props.onImportJson}
            onOpenRecentProject={props.onOpenRecentProject}
            onResetToDefaultProject={props.onResetToDefaultProject}
            onImportFile={props.onImportFile}
          />
          <button
            type="button"
            className="patch-workspace-back-button transport-nav-button"
            title="Back to Composer"
            aria-label="Back to Composer"
            onClick={props.onBackToComposer}
          >
            <BackArrowIcon className="transport-nav-button-icon" />
            <span>Composer</span>
          </button>
          <div className="patch-workspace-title">
            <h2>Patch Workspace</h2>
          </div>
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
          probeState={props.probeState}
          macroValues={props.macroValues}
          migrationNotice={props.migrationNotice}
          onReady={props.onInstrumentEditorReady}
          selectedNodeId={props.selectedNodeId}
          selectedMacroId={props.selectedMacroId}
          validationIssues={props.validationIssues}
          invalid={props.invalid}
          onSelectNode={props.onSelectNode}
          onSelectMacro={props.onSelectMacro}
          onClearSelectedMacro={props.onClearSelectedMacro}
          onClearPatch={props.onClearPatch}
          onApplyOp={props.onApplyOp}
          probeActions={props.probeActions}
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
