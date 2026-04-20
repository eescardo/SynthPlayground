import { clampNormalizedMacroValue } from "@/lib/patch/macroKeyframes";
import { Patch } from "@/types/patch";
import { PatchWorkspaceTabState } from "@/types/music";
import { PatchOp } from "@/types/ops";

export interface LocalPatchWorkspaceTab extends PatchWorkspaceTabState {
  migrationNotice: string | null;
}

export const PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY = "synth-playground:patch-workspace-tab-macro-values";
export const MAX_PATCH_WORKSPACE_TABS = 16;

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
  op.type !== "setParams" &&
  op.type !== "addMacro" &&
  op.type !== "removeMacro" &&
  op.type !== "bindMacro" &&
  op.type !== "unbindMacro" &&
  op.type !== "renameMacro" &&
  op.type !== "setMacroKeyframeCount";

export const toLocalTab = (tab: PatchWorkspaceTabState): LocalPatchWorkspaceTab => ({
  ...tab,
  probes: Array.isArray(tab.probes) ? tab.probes : [],
  migrationNotice: null
});

export const toPersistedTab = (tab: LocalPatchWorkspaceTab): PatchWorkspaceTabState => ({
  id: tab.id,
  name: tab.name,
  patchId: tab.patchId,
  baselinePatch: tab.baselinePatch,
  selectedNodeId: tab.selectedNodeId,
  selectedMacroId: tab.selectedMacroId,
  selectedProbeId: tab.selectedProbeId,
  probes: tab.probes
});

export const getActiveTab = (tabs: LocalPatchWorkspaceTab[], activeTabId?: string) =>
  tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

export const createNextTabName = (tabs: Array<{ name: string }>) => {
  const existingNames = new Set(tabs.map((tab) => tab.name));

  for (let index = 1; index <= MAX_PATCH_WORKSPACE_TABS; index += 1) {
    const candidate = `Tab ${index}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  let overflowIndex = MAX_PATCH_WORKSPACE_TABS + 1;
  while (existingNames.has(`Tab ${overflowIndex}`)) {
    overflowIndex += 1;
  }
  return `Tab ${overflowIndex}`;
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

export const retargetRemovedPatchTabs = (
  tabs: LocalPatchWorkspaceTab[],
  removedPatchId: string,
  replacementPatchId: string
) =>
  tabs.map((tab) => (tab.patchId === removedPatchId ? resetWorkspaceTabForPatch(tab, replacementPatchId) : tab));

export const resetWorkspaceTabForPatch = (tab: LocalPatchWorkspaceTab, patchId: string): LocalPatchWorkspaceTab => ({
  ...tab,
  patchId,
  baselinePatch: undefined,
  selectedNodeId: undefined,
  selectedMacroId: undefined,
  selectedProbeId: undefined,
  probes: [],
  migrationNotice: null
});

export const resolveRemovedPatchFallbackId = (patches: Patch[], removedPatchId: string): string | undefined => {
  const removedIndex = patches.findIndex((patch) => patch.id === removedPatchId);
  if (removedIndex < 0) {
    return undefined;
  }

  for (let index = removedIndex - 1; index >= 0; index -= 1) {
    const candidate = patches[index];
    if (candidate) {
      return candidate.id;
    }
  }

  for (let index = removedIndex + 1; index < patches.length; index += 1) {
    const candidate = patches[index];
    if (candidate) {
      return candidate.id;
    }
  }

  return undefined;
};

export const sanitizeWorkspaceTabs = (
  tabs: LocalPatchWorkspaceTab[],
  patchById: Map<string, Patch>,
  patchNameById: Map<string, string>,
  fallbackPatchId: string,
  createWorkspaceTab: (patchId: string) => LocalPatchWorkspaceTab
) => {
  const nextTabs = tabs
    .filter((tab) => patchById.has(tab.patchId))
    .map((tab) => {
      const patch = patchById.get(tab.patchId);
      const probes = (tab.probes ?? []).filter((probe) => {
        const target = probe.target;
        if (!target) {
          return true;
        }
        if (target.kind === "connection") {
          return Boolean(patch?.connections.some((connection) => connection.id === target.connectionId));
        }
        return Boolean(patch?.nodes.some((node) => node.id === target.nodeId));
      });
      return {
        ...tab,
        name: tab.name || patchNameById.get(tab.patchId) || "Instrument",
        probes,
        selectedMacroId:
          tab.selectedMacroId && patch?.ui.macros.some((macro) => macro.id === tab.selectedMacroId) ? tab.selectedMacroId : undefined,
        selectedProbeId: tab.selectedProbeId && probes.some((probe) => probe.id === tab.selectedProbeId) ? tab.selectedProbeId : undefined
      };
    });
  return nextTabs.length > 0 ? nextTabs : [{ ...createWorkspaceTab(fallbackPatchId), probes: [] }];
};
