import { describe, expect, it } from "vitest";
import {
  createNextTabName,
  isAudiblePatchOp,
  MAX_PATCH_WORKSPACE_TABS,
  parseTabMacroValues,
  pruneTabMacroValues,
  retargetRemovedPatchTabs
} from "@/hooks/patch/patchWorkspaceStateUtils";

describe("patchWorkspaceStateUtils", () => {
  it("creates the first unused sequential tab name", () => {
    expect(createNextTabName([])).toBe("Tab 1");
    expect(createNextTabName([{ name: "Tab 1" }, { name: "Ideas" }, { name: "Tab 3" }])).toBe("Tab 2");
  });

  it("falls back to the next unique overflow number after the preferred range", () => {
    const tabs = Array.from({ length: MAX_PATCH_WORKSPACE_TABS }, (_, index) => ({ name: `Tab ${index + 1}` }));
    expect(createNextTabName(tabs)).toBe("Tab 17");
    expect(createNextTabName([...tabs, { name: "Tab 17" }, { name: "Tab 19" }])).toBe("Tab 18");
  });

  it("parses and clamps session macro values while ignoring invalid entries", () => {
    const parsed = parseTabMacroValues(
      JSON.stringify({
        tab_a: {
          macro_cutoff: 1.4,
          macro_decay: -0.2,
          ignored: "bad"
        },
        tab_b: {
          macro_mix: 0.45
        }
      })
    );

    expect(parsed).toEqual({
      tab_a: {
        macro_cutoff: 1,
        macro_decay: 0
      },
      tab_b: {
        macro_mix: 0.45
      }
    });
  });

  it("prunes session macro values for tabs that no longer exist", () => {
    expect(
      pruneTabMacroValues(
        {
          tab_a: { macro_cutoff: 0.2 },
          tab_b: { macro_cutoff: 0.7 }
        },
        ["tab_b", "tab_c"]
      )
    ).toEqual({
      tab_b: { macro_cutoff: 0.7 }
    });
  });

  it("treats structural and graph changes as audible but ignores layout-only operations", () => {
    expect(isAudiblePatchOp({ type: "moveNode", nodeId: "node_1", newLayoutPos: { x: 10, y: 20 } })).toBe(false);
    expect(isAudiblePatchOp({ type: "setCanvasZoom", zoom: 1.1 })).toBe(false);
    expect(isAudiblePatchOp({ type: "renameMacro", macroId: "macro_1", name: "Shape" })).toBe(false);
    expect(
      isAudiblePatchOp({
        type: "connect",
        connectionId: "conn_1",
        fromNodeId: "osc",
        fromPortId: "out",
        toNodeId: "out",
        toPortId: "in"
      })
    ).toBe(true);
  });

  it("keeps tabs while retargeting a removed patch to a replacement clear patch", () => {
    expect(
      retargetRemovedPatchTabs(
        [
          {
            id: "tab_a",
            name: "Lead Sketch",
            patchId: "patch_removed",
            selectedNodeId: "osc1",
            selectedMacroId: "macro_cutoff",
            selectedProbeId: "probe_1",
            probes: [{ id: "probe_1", kind: "scope", name: "Scope Probe", x: 0, y: 0, width: 10, height: 8 }],
            migrationNotice: "Old notice"
          },
          {
            id: "tab_b",
            name: "Bass",
            patchId: "patch_other",
            probes: [],
            migrationNotice: null
          }
        ],
        "patch_removed",
        "patch_replacement"
      )
    ).toEqual([
      {
        id: "tab_a",
        name: "Lead Sketch",
        patchId: "patch_replacement",
        selectedNodeId: undefined,
        selectedMacroId: undefined,
        selectedProbeId: undefined,
        probes: [],
        migrationNotice: null
      },
      {
        id: "tab_b",
        name: "Bass",
        patchId: "patch_other",
        probes: [],
        migrationNotice: null
      }
    ]);
  });
});
