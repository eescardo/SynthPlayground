import { describe, expect, it } from "vitest";

import { LocalPatchWorkspaceTab } from "@/hooks/patch/patchWorkspaceStateUtils";
import { createDuplicatePatchWorkspaceTab } from "@/hooks/patch/usePatchWorkspaceLifecycleActions";
import { createClearPatch } from "@/lib/patch/presets";

describe("patch workspace lifecycle action helpers", () => {
  it("creates a duplicated tab with a baseline snapshot, copied selections, and fresh probe ids", () => {
    const selectedPatch = createClearPatch({ id: "patch_source", name: "Source" });
    selectedPatch.ports![0].params.gainDb = -4;
    const duplicatePatch = createClearPatch({ id: "patch_duplicate", name: "Source Copy" });
    const activeTab: LocalPatchWorkspaceTab = {
      id: "tab_source",
      name: "Source Tab",
      patchId: selectedPatch.id,
      baselinePatch: undefined,
      selectedNodeId: "output",
      selectedMacroId: "macro_cutoff",
      selectedProbeId: "probe_scope",
      probes: [
        {
          id: "probe_scope",
          kind: "scope",
          name: "Scope",
          x: 1,
          y: 2,
          width: 10,
          height: 6,
          target: { kind: "connection", connectionId: "conn_out" }
        },
        {
          id: "probe_spectrum",
          kind: "spectrum",
          name: "Spectrum",
          x: 4,
          y: 5,
          width: 8,
          height: 5,
          spectrumWindowSize: 1024
        }
      ],
      migrationNotice: null
    };

    const nextTab = createDuplicatePatchWorkspaceTab({
      activeTab,
      createWorkspaceTab: (patchId, name) => ({
        id: "tab_duplicate",
        name: name ?? "Duplicate",
        patchId,
        selectedNodeId: undefined,
        selectedMacroId: undefined,
        selectedProbeId: undefined,
        probes: [],
        migrationNotice: null
      }),
      duplicatePatch,
      selectedPatch
    });

    selectedPatch.name = "Mutated Source";
    selectedPatch.ports![0].params.gainDb = -18;

    expect(nextTab.id).toBe("tab_duplicate");
    expect(nextTab.patchId).toBe(duplicatePatch.id);
    expect(nextTab.name).toBe(duplicatePatch.name);
    expect(nextTab.baselinePatch).not.toBe(selectedPatch);
    expect(nextTab.baselinePatch?.name).toBe("Source");
    expect(nextTab.baselinePatch?.ports?.[0].params.gainDb).toBe(-4);
    expect(nextTab.selectedNodeId).toBe(activeTab.selectedNodeId);
    expect(nextTab.selectedMacroId).toBe(activeTab.selectedMacroId);
    expect(nextTab.selectedProbeId).toBeUndefined();
    expect(nextTab.probes).toHaveLength(activeTab.probes.length);
    expect(nextTab.probes.map((probe) => probe.id)).not.toEqual(activeTab.probes.map((probe) => probe.id));
    expect(nextTab.probes.map((probe) => ({ ...probe, id: undefined }))).toEqual(
      activeTab.probes.map((probe) => ({ ...probe, id: undefined }))
    );
  });
});
