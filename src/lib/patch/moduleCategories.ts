import { PatchModuleCategory, SignalCapability } from "@/types/patch";

export const PATCH_MODULE_CATEGORY_PRIORITY: PatchModuleCategory[] = [
  "envelope",
  "source",
  "processor",
  "mix",
  "cv",
  "probe",
  "host"
];

export const PATCH_MODULE_CATEGORY_COLORS: Record<PatchModuleCategory, string> = {
  source: "#6fc6ff",
  mix: "#a8b5c5",
  cv: "#7ad488",
  processor: "#b592ff",
  envelope: "#a83317",
  probe: "#c8ff39",
  host: "#6f7882"
};

export const PATCH_MODULE_CATEGORY_MUTED_COLORS: Record<
  PatchModuleCategory,
  { fill: string; stroke: string; accent: string }
> = {
  source: {
    fill: "#17354a",
    stroke: "#3f7290",
    accent: "#70c1f4"
  },
  mix: {
    fill: "#283341",
    stroke: "#677588",
    accent: "#b2bdc9"
  },
  cv: {
    fill: "#183723",
    stroke: "#427858",
    accent: "#8cdc9d"
  },
  processor: {
    fill: "#2a2340",
    stroke: "#6b5b8f",
    accent: "#c2abff"
  },
  envelope: {
    fill: "#381712",
    stroke: "#7d3020",
    accent: "#c6492b"
  },
  probe: {
    fill: "#24310b",
    stroke: "#6b9324",
    accent: "#cfff56"
  },
  host: {
    fill: "#23282e",
    stroke: "#5a636d",
    accent: "#97a0aa"
  }
};

export const resolvePatchModuleCategory = (
  categories: PatchModuleCategory[] | undefined
): PatchModuleCategory | null => {
  if (!categories || categories.length === 0) {
    return null;
  }
  for (const category of PATCH_MODULE_CATEGORY_PRIORITY) {
    if (categories.includes(category)) {
      return category;
    }
  }
  return categories[0] ?? null;
};

export const resolvePatchModuleCategoryColor = (categories: PatchModuleCategory[] | undefined): string =>
  PATCH_MODULE_CATEGORY_COLORS[resolvePatchModuleCategory(categories) ?? "host"];

export const resolveMutedPatchModuleColors = (categories: PatchModuleCategory[] | undefined) =>
  PATCH_MODULE_CATEGORY_MUTED_COLORS[resolvePatchModuleCategory(categories) ?? "host"];

export const getSignalCapabilityColor = (capability: SignalCapability | undefined) => {
  if (capability === "AUDIO") {
    return "#6fc6ff";
  }
  if (capability === "CV" || capability === "GATE") {
    return "#7ad488";
  }
  return "#9ec7eb";
};
