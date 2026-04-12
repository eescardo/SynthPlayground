import { describe, expect, it } from "vitest";
import {
  createNextTabName,
  isAudiblePatchOp,
  MAX_PATCH_WORKSPACE_TABS,
  parseTabMacroValues,
  pruneTabMacroValues
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
});
