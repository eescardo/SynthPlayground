import { describe, expect, it } from "vitest";

import { clearBaselinePatchForTab, setBaselinePatchForTab } from "@/hooks/patch/usePatchWorkspaceBaseline";
import { createClearPatch } from "@/lib/patch/presets";
import { LocalPatchWorkspaceTab } from "@/hooks/patch/patchWorkspaceStateUtils";

describe("patch workspace baseline helpers", () => {
  it("stores a baseline patch snapshot instead of sharing the source patch object", () => {
    const sourcePatch = createClearPatch({ id: "patch_source", name: "Source" });
    sourcePatch.nodes[0].params.gain = 0.8;
    const tab = createTab("patch_source");

    const nextTab = setBaselinePatchForTab(tab, sourcePatch);
    sourcePatch.name = "Mutated Source";
    sourcePatch.nodes[0].params.gain = 0.2;

    expect(nextTab.baselinePatch).toEqual({
      ...createClearPatch({ id: "patch_source", name: "Source" }),
      nodes: expect.any(Array)
    });
    expect(nextTab.baselinePatch).not.toBe(sourcePatch);
    expect(nextTab.baselinePatch?.nodes[0]).not.toBe(sourcePatch.nodes[0]);
    expect(nextTab.baselinePatch?.name).toBe("Source");
    expect(nextTab.baselinePatch?.nodes[0].params.gain).toBe(0.8);
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
