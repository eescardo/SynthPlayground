import { describe, expect, it } from "vitest";

import {
  createClearedWorkspacePatch,
  createCustomDuplicatePatch
} from "@/hooks/patch/patchWorkspacePatchHelpers";
import { createClearPatch } from "@/lib/patch/presets";

describe("patchWorkspacePatchHelpers", () => {
  it("creates a custom duplicate patch copy", () => {
    const source = createClearPatch({
      id: "patch_source",
      name: "Lead",
      meta: {
        source: "preset",
        presetId: "preset_lead",
        presetVersion: 3
      }
    });
    const duplicate = createCustomDuplicatePatch(source);

    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.name).toBe("Lead Copy");
    expect(duplicate.meta).toEqual({
      source: "custom",
      basedOnPresetId: "preset_lead",
      basedOnPresetVersion: 3
    });
    expect(duplicate.nodes).toEqual(source.nodes);
  });

  it("creates a cleared workspace patch while preserving output node placement", () => {
    const source = createClearPatch({
      id: "patch_source",
      name: "Sampler",
      outputNodeId: "main_out",
      outputPosition: { x: 30, y: 12 },
      canvasZoom: 1.4
    });
    source.nodes.unshift({
      id: "sample1",
      typeId: "SamplePlayer",
      params: {
        mode: "oneshot",
        start: 0,
        end: 1,
        gain: 1,
        pitchSemis: 0,
        sampleData: ""
      }
    });
    source.layout.nodes.unshift({ nodeId: "sample1", x: 8, y: 6 });

    const cleared = createClearedWorkspacePatch(source);

    expect(cleared.id).toBe(source.id);
    expect(cleared.name).toBe(source.name);
    expect(cleared.nodes).toHaveLength(1);
    expect(cleared.nodes[0]?.id).toBe("main_out");
    expect(cleared.layout.nodes).toEqual([{ nodeId: "main_out", x: 30, y: 12 }]);
    expect(cleared.ui.canvasZoom).toBe(1.4);
  });

  it("preserves existing preset lineage when duplicating a custom clone", () => {
    const source = createClearPatch({
      id: "patch_source",
      name: "Pad Copy",
      meta: {
        source: "custom",
        basedOnPresetId: "preset_pad",
        basedOnPresetVersion: 5
      }
    });

    const duplicate = createCustomDuplicatePatch(source);

    expect(duplicate.meta).toEqual({
      source: "custom",
      basedOnPresetId: "preset_pad",
      basedOnPresetVersion: 5
    });
  });
});
