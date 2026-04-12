import { clampNormalizedMacroValue } from "@/lib/patch/macroKeyframes";
import { PatchWorkspaceTabState } from "@/types/music";
import { PatchOp } from "@/types/ops";

export interface LocalPatchWorkspaceTab extends PatchWorkspaceTabState {
  migrationNotice: string | null;
}

export const PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY = "synth-playground:patch-workspace-tab-macro-values";

export const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  const isTextInput =
    element instanceof HTMLInputElement
      ? ["text", "search", "url", "email", "tel", "password", "number"].includes(element.type)
      : false;
  return Boolean(
    element &&
      (isTextInput ||
        element.tagName === "SELECT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable)
  );
};

export const isShortcutBlockedTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (isTextEditingTarget(element) ||
        element.tagName === "BUTTON" ||
        element.tagName === "A" ||
        element.closest("[role='dialog']"))
  );
};

export const isAudiblePatchOp = (op: PatchOp): boolean =>
  op.type !== "moveNode" &&
  op.type !== "setNodeLayout" &&
  op.type !== "setCanvasZoom" &&
  op.type !== "addMacro" &&
  op.type !== "removeMacro" &&
  op.type !== "bindMacro" &&
  op.type !== "unbindMacro" &&
  op.type !== "renameMacro" &&
  op.type !== "setMacroKeyframeCount";

export const toLocalTab = (tab: PatchWorkspaceTabState): LocalPatchWorkspaceTab => ({
  ...tab,
  migrationNotice: null
});

export const toPersistedTab = (tab: LocalPatchWorkspaceTab): PatchWorkspaceTabState => ({
  id: tab.id,
  name: tab.name,
  patchId: tab.patchId,
  selectedNodeId: tab.selectedNodeId,
  selectedMacroId: tab.selectedMacroId
});

export const getActiveTab = (tabs: LocalPatchWorkspaceTab[], activeTabId?: string) =>
  tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

export const createNextTabName = (tabs: Array<{ name: string }>) => {
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `Tab ${index}`;
    if (!tabs.some((tab) => tab.name === candidate)) {
      return candidate;
    }
  }
  return `Tab ${Date.now()}`;
};

export const parseTabMacroValues = (raw: string | null): Record<string, Record<string, number>> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(parsed).map(([tabId, macroValues]) => [
        tabId,
        Object.fromEntries(
          Object.entries(macroValues).flatMap(([macroId, normalized]) =>
            typeof normalized === "number" && Number.isFinite(normalized)
              ? [[macroId, clampNormalizedMacroValue(normalized)]]
              : []
          )
        )
      ])
    );
  } catch {
    return {};
  }
};

export const pruneTabMacroValues = (
  tabMacroValuesById: Record<string, Record<string, number>>,
  validTabIds: Iterable<string>
) => {
  const validIdSet = new Set(validTabIds);
  return Object.fromEntries(
    Object.entries(tabMacroValuesById).filter(([tabId]) => validIdSet.has(tabId))
  );
};
