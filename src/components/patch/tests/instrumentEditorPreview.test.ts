import { describe, expect, it } from "vitest";
import { createInstrumentEditorPreviewReadyKey } from "@/components/patch/instrumentEditorPreview";

describe("instrumentEditorPreview", () => {
  it("changes readiness key when tab identity changes even if patch and macros match", () => {
    const macroValues = { macro_cutoff: 0.5, macro_decay: 0.25 };

    const leftTabKey = createInstrumentEditorPreviewReadyKey("tab_a", "preset_bass", macroValues);
    const rightTabKey = createInstrumentEditorPreviewReadyKey("tab_b", "preset_bass", macroValues);

    expect(leftTabKey).not.toBe(rightTabKey);
  });

  it("keeps readiness key stable for the same tab, patch, and macro snapshot", () => {
    const macroValues = { macro_cutoff: 0.5 };

    expect(createInstrumentEditorPreviewReadyKey("tab_a", "preset_bass", macroValues)).toBe(
      createInstrumentEditorPreviewReadyKey("tab_a", "preset_bass", macroValues)
    );
  });
});
