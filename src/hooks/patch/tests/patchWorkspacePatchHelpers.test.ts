import { describe, expect, it } from "vitest";

import {
  createImportedWorkspacePatch,
  createClearedWorkspacePatch,
  createCustomDuplicatePatch
} from "@/hooks/patch/patchWorkspacePatchHelpers";
import { createClearPatch, presetPatches } from "@/lib/patch/presets";

describe("patchWorkspacePatchHelpers", () => {
  it("creates a custom duplicate patch copy", () => {
    const source = createClearPatch({
      id: "patch_source",
      name: "Lead"
    });
    const duplicate = createCustomDuplicatePatch(source);

    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.name).toBe("Lead Copy");
    expect(duplicate.meta).toEqual({ source: "custom" });
    expect(duplicate.nodes).toEqual(source.nodes);
  });

  it("imports preset patches as removable custom duplicates", () => {
    const imported = createImportedWorkspacePatch(presetPatches[0]);

    expect(imported.id).not.toBe(presetPatches[0].id);
    expect(imported.name).toBe(`${presetPatches[0].name} Copy`);
    expect(imported.meta).toEqual({ source: "custom" });
  });

  it("keeps imported custom patches unchanged", () => {
    const source = createClearPatch({
      id: "patch_imported",
      name: "Imported Lead"
    });

    expect(createImportedWorkspacePatch(source)).toBe(source);
  });

  it("creates a cleared workspace patch while preserving the output port", () => {
    const source = createClearPatch({
      id: "patch_source",
      name: "Sampler",
      outputNodeId: "main_out",
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
    expect(cleared.nodes).toHaveLength(0);
    expect(cleared.ports).toEqual(source.ports);
    expect(cleared.io.audioOutNodeId).toBe("main_out");
    expect(cleared.layout.nodes).toEqual([]);
    expect(cleared.ui.canvasZoom).toBe(1.4);
  });

});
