"use client";

import { useCallback, useMemo } from "react";
import { getProjectPresetUpdateSummary, updateProjectPresetsToLatest } from "@/lib/patch/source";
import type { Project } from "@/types/music";
import type { CommitProjectChange } from "./useAppProjectChanges";

export function useAppPresetUpdates({
  project,
  ready,
  commitProjectChange
}: {
  project: Project;
  ready: boolean;
  commitProjectChange: CommitProjectChange;
}) {
  const presetUpdateSummary = useMemo(() => getProjectPresetUpdateSummary(project), [project]);
  const showPresetUpdatePrompt = Boolean(ready && presetUpdateSummary);
  const dismissPresetUpdatePrompt = useCallback(() => {
    if (!presetUpdateSummary) {
      return;
    }
    const dismissedPresetUpdateVersions = Object.fromEntries(
      presetUpdateSummary.updates.map((update) => [update.presetId, update.nextVersion])
    );
    commitProjectChange(
      (current) => ({
        ...current,
        ui: {
          ...current.ui,
          dismissedPresetUpdateVersions: {
            ...(current.ui.dismissedPresetUpdateVersions ?? {}),
            ...dismissedPresetUpdateVersions
          }
        }
      }),
      { actionKey: "project:dismiss-preset-updates", skipHistory: true }
    );
  }, [commitProjectChange, presetUpdateSummary]);

  const updateAllPresetUpdates = useCallback(() => {
    commitProjectChange(updateProjectPresetsToLatest, { actionKey: "project:update-presets" });
  }, [commitProjectChange]);

  return { presetUpdateSummary, showPresetUpdatePrompt, dismissPresetUpdatePrompt, updateAllPresetUpdates };
}
