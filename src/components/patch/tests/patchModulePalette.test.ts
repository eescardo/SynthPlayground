import { describe, expect, it } from "vitest";
import { buildModulePaletteGroups } from "@/components/patch/patchModulePaletteGroups";

describe("buildModulePaletteGroups", () => {
  it("shows modules under each declared non-host category", () => {
    const groups = buildModulePaletteGroups();
    const mixModules = groups.find((group) => group.category === "mix")?.modules.map((module) => module.typeId);
    const cvModules = groups.find((group) => group.category === "cv")?.modules.map((module) => module.typeId);

    expect(mixModules).toContain("CVMixer4");
    expect(cvModules).toContain("CVMixer4");
  });

  it("does not create a host category in the add-module palette", () => {
    expect(buildModulePaletteGroups().map((group) => group.category)).not.toContain("host");
  });
});
