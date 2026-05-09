import { PATCH_MODULE_CATEGORY_PRIORITY } from "@/lib/patch/moduleCategories";
import { modulePalette } from "@/lib/patch/moduleRegistry";
import { ModuleTypeSchema, PatchModuleCategory } from "@/types/patch";

export function buildModulePaletteGroups() {
  const groups = new Map<PatchModuleCategory, ModuleTypeSchema[]>();
  modulePalette.forEach((module) => {
    const categories = Array.from(new Set(module.categories.filter((entry) => entry !== "host")));
    categories.forEach((category) => {
      const existing = groups.get(category) ?? [];
      existing.push(module);
      groups.set(category, existing);
    });
  });
  return PATCH_MODULE_CATEGORY_PRIORITY.filter((category) => category !== "host")
    .map((category) => ({
      category,
      modules: groups.get(category) ?? []
    }))
    .filter((group) => group.modules.length > 0);
}
