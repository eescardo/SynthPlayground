import { createId } from "@/lib/ids";
import { createClearPatch } from "@/lib/patch/presets";
import { Patch } from "@/types/patch";

export function createCustomDuplicatePatch(sourcePatch: Patch): Patch {
  const duplicate = structuredClone(sourcePatch);
  duplicate.id = createId("patch");
  duplicate.name = `${sourcePatch.name} Copy`;
  duplicate.meta =
    sourcePatch.meta.source === "preset"
      ? {
          source: "custom",
          basedOnPresetId: sourcePatch.meta.presetId,
          basedOnPresetVersion: sourcePatch.meta.presetVersion
        }
      : sourcePatch.meta.basedOnPresetId
        ? {
            source: "custom",
            basedOnPresetId: sourcePatch.meta.basedOnPresetId,
            basedOnPresetVersion: sourcePatch.meta.basedOnPresetVersion
          }
        : { source: "custom" };
  return duplicate;
}

export function createClearedWorkspacePatch(sourcePatch: Patch): Patch {
  const existingOutputNode = sourcePatch.nodes.find((node) => node.typeId === "Output");
  const existingOutputLayout = existingOutputNode
    ? sourcePatch.layout.nodes.find((node) => node.nodeId === existingOutputNode.id)
    : undefined;

  return createClearPatch({
    id: sourcePatch.id,
    name: sourcePatch.name,
    meta: sourcePatch.meta,
    outputNodeId: existingOutputNode?.id ?? "out1",
    outputPosition: existingOutputLayout ? { x: existingOutputLayout.x, y: existingOutputLayout.y } : undefined,
    canvasZoom: sourcePatch.ui.canvasZoom
  });
}
