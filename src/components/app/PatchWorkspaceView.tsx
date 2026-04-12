"use client";

import { useEffect, useState } from "react";
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { QuickHelpDialog } from "@/components/QuickHelpDialog";
import { usePatchWorkspaceQuickHelpDialog } from "@/hooks/patch/usePatchWorkspaceQuickHelpDialog";
import { Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface PatchWorkspaceTabViewModel {
  id: string;
  name: string;
  patchId: string;
}

interface PatchWorkspaceViewProps {
  patch: Patch;
  patches: Patch[];
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
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [tabNameDraft, setTabNameDraft] = useState(props.tabs.find((tab) => tab.id === props.activeTabId)?.name ?? props.patch.name);

  useEffect(() => {
    if (renamingTabId === props.activeTabId) {
      setTabNameDraft(props.tabs.find((tab) => tab.id === props.activeTabId)?.name ?? props.patch.name);
    }
  }, [props.activeTabId, props.patch.name, props.tabs, renamingTabId]);

  const startRename = (tabId: string, currentName: string, event: ReactMouseEvent | ReactKeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    props.onActivateTab(tabId);
    setRenamingTabId(tabId);
    setTabNameDraft(currentName);
  };

  const commitTabRename = () => {
    const nextName = tabNameDraft.trim();
    const currentTab = props.tabs.find((tab) => tab.id === renamingTabId);
    if (nextName.length > 0 && renamingTabId && currentTab && nextName !== currentTab.name) {
      props.onRenameTab(renamingTabId, nextName);
    }
    setRenamingTabId(null);
    setTabNameDraft(props.tabs.find((tab) => tab.id === props.activeTabId)?.name ?? props.patch.name);
  };

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
        <div className="patch-workspace-tabs" role="tablist" aria-label="Open instrument tabs">
          {props.tabs.map((tab) => {
            const tabName = tab.name;
            const active = tab.id === props.activeTabId;
            const editing = renamingTabId === tab.id;

            return (
              <div
                key={tab.id}
                className={`patch-workspace-tab${active ? " active" : ""}`}
                role="tab"
                tabIndex={active ? 0 : -1}
                aria-selected={active}
                onClick={() => props.onActivateTab(tab.id)}
              >
                {editing ? (
                  <input
                    className="patch-workspace-tab-name-input"
                    aria-label="Tab name"
                    autoFocus
                    size={Math.max(1, tabNameDraft.length)}
                    value={tabNameDraft}
                    onBlur={commitTabRename}
                    onChange={(event) => setTabNameDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitTabRename();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setRenamingTabId(null);
                        setTabNameDraft(tab.name);
                      }
                    }}
                  />
                ) : (
                  <>
                    <span
                      className="patch-workspace-tab-name"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        if (!active) {
                          return;
                        }
                        startRename(tab.id, tabName, event);
                      }}
                      onKeyDown={(event) => {
                        if (active && (event.key === "Enter" || event.key === " ")) {
                          startRename(tab.id, tabName, event);
                        }
                      }}
                    >
                      {tabName}
                    </span>
                    {props.tabs.length > 1 && (
                      <button
                        type="button"
                        className="patch-workspace-tab-close"
                        aria-label={`Close ${tabName} tab`}
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onCloseTab(tab.id);
                        }}
                      >
                        x
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
          <button type="button" className="patch-workspace-tab-add" aria-label="New instrument tab" onClick={props.onCreateTab}>
            +
          </button>
        </div>

        <InstrumentEditor
          patch={props.patch}
          patches={props.patches}
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
