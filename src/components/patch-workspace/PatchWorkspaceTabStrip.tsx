"use client";

import { useEffect, useState } from "react";
import { useInlineRename } from "@/hooks/useInlineRename";
import { useRenameActivation } from "@/hooks/useRenameActivation";

export interface PatchWorkspaceTabViewModel {
  id: string;
  name: string;
  patchId: string;
}

interface PatchWorkspaceTabStripProps {
  tabs: PatchWorkspaceTabViewModel[];
  activeTabId?: string;
  canCreateTab?: boolean;
  onActivateTab: (tabId: string) => void;
  onCreateTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
}

export function PatchWorkspaceTabStrip(props: PatchWorkspaceTabStripProps) {
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const renameActivation = useRenameActivation<string>();
  const activeTab = props.tabs.find((tab) => tab.id === props.activeTabId);
  const rename = useInlineRename({
    value: activeTab?.name ?? "",
    onCommit: (nextName) => {
      if (renamingTabId) {
        props.onRenameTab(renamingTabId, nextName);
      }
    }
  });
  const { cancel, commit, draft, setDraft, setEditing } = rename;

  useEffect(() => {
    if (renamingTabId === props.activeTabId && activeTab) {
      setDraft(activeTab.name);
    }
  }, [activeTab, props.activeTabId, renamingTabId, setDraft]);

  const startRename = (tabId: string, currentName: string) => {
    props.onActivateTab(tabId);
    setRenamingTabId(tabId);
    setDraft(currentName);
    setEditing(true);
  };

  const stopRenaming = () => {
    setRenamingTabId(null);
    setEditing(false);
  };

  return (
    <div className="patch-workspace-tabs" role="tablist" aria-label="Open instrument tabs">
      {props.canCreateTab !== false && (
        <button type="button" className="patch-workspace-tab-add" aria-label="New instrument tab" onClick={props.onCreateTab}>
          +
        </button>
      )}
      <div className="patch-workspace-tab-list">
        {props.tabs.map((tab) => {
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
                  size={Math.max(1, draft.length)}
                  value={draft}
                  onBlur={() => {
                    commit();
                    stopRenaming();
                  }}
                  onChange={(event) => setDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit();
                      stopRenaming();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancel();
                      stopRenaming();
                    }
                    event.stopPropagation();
                  }}
                />
              ) : (
                <>
                  <span
                    className={`patch-workspace-tab-name${renameActivation.isArmed(tab.id) ? " rename-armed" : ""}`}
                    role="button"
                    tabIndex={0}
                    {...renameActivation.getRenameTriggerProps({
                      id: tab.id,
                      onStartRename: () => startRename(tab.id, tab.name)
                    })}
                  >
                    {tab.name}
                  </span>
                  {props.tabs.length > 1 && (
                    <button
                      type="button"
                      className="patch-workspace-tab-close"
                      aria-label={`Close ${tab.name} tab`}
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
      </div>
    </div>
  );
}
