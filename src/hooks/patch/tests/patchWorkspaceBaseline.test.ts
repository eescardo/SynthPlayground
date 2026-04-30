import { describe, expect, it } from "vitest";

import { clearBaselinePatchForTab, setBaselinePatchForTab } from "@/hooks/patch/usePatchWorkspaceBaseline";
import { createClearPatch } from "@/lib/patch/presets";
import { LocalPatchWorkspaceTab } from "@/hooks/patch/patchWorkspaceStateUtils";

describe("patch workspace baseline helpers", () => {
  it("stores a baseline patch snapshot instead of sharing the source patch object", () => {
    const sourcePatch = createClearPatch({ id: "patch_source", name: "Source" });
    sourcePatch.ports![0].params.gainDb = -3;
    const tab = createTab("patch_source");

    const nextTab = setBaselinePatchForTab(tab, sourcePatch);
    sourcePatch.name = "Mutated Source";
    sourcePatch.ports![0].params.gainDb = -12;

    expect(nextTab.baselinePatch).toEqual({
      ...createClearPatch({ id: "patch_source", name: "Source" }),
      ports: expect.any(Array)
    });
    expect(nextTab.baselinePatch).not.toBe(sourcePatch);
    expect(nextTab.baselinePatch?.ports?.[0]).not.toBe(sourcePatch.ports?.[0]);
    expect(nextTab.baselinePatch?.name).toBe("Source");
    expect(nextTab.baselinePatch?.ports?.[0].params.gainDb).toBe(-3);
  });

  it("clears the baseline snapshot without changing the rest of the tab state", () => {
    const baselinePatch = createClearPatch({ id: "patch_source", name: "Source" });
    const tab = {
      ...createTab("patch_source"),
      baselinePatch,
      selectedNodeId: "output",
      selectedMacroId: "macro_cutoff"
    };

    expect(clearBaselinePatchForTab(tab)).toEqual({
      ...tab,
      baselinePatch: undefined
    });
  });
});

function createTab(patchId: string): LocalPatchWorkspaceTab {
  return {
    id: "tab_a",
    name: "Tab A",
    patchId,
    baselinePatch: undefined,
    selectedNodeId: undefined,
    selectedMacroId: undefined,
    selectedProbeId: undefined,
    probes: [],
    migrationNotice: null
  };
}
