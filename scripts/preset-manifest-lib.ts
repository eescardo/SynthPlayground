import { presetPatches } from "@/lib/patch/presets";

export interface PresetManifestEntry {
  presetId: string;
  presetVersion: number;
  name: string;
  macroIds: string[];
}

export const buildPresetManifest = (): PresetManifestEntry[] =>
  presetPatches
    .flatMap((patch) =>
      patch.meta.source === "preset"
        ? [
            {
              presetId: patch.meta.presetId,
              presetVersion: patch.meta.presetVersion,
              name: patch.name,
              macroIds: patch.ui.macros.map((macro) => macro.id)
            }
          ]
        : []
    )
    .sort((a, b) => a.presetId.localeCompare(b.presetId));

export const serializePresetManifest = (): string => `${JSON.stringify(buildPresetManifest(), null, 2)}\n`;
