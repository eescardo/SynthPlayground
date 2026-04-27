import { createId } from "@/lib/ids";
import { createClearPatch } from "@/lib/patch/presets";
import { getPatchOutputPort } from "@/lib/patch/ports";
import { resolvePatchSource } from "@/lib/patch/source";
import { Patch } from "@/types/patch";

export function createCustomDuplicatePatch(sourcePatch: Patch): Patch {
  const duplicate = structuredClone(sourcePatch);
  duplicate.id = createId("patch");
  duplicate.name = `${sourcePatch.name} Copy`;
  duplicate.meta = { source: "custom" };
  return duplicate;
}

export function createImportedWorkspacePatch(sourcePatch: Patch): Patch {
  if (resolvePatchSource(sourcePatch) === "preset") {
    return createCustomDuplicatePatch(sourcePatch);
  }
  return sourcePatch;
}

export function createClearedWorkspacePatch(sourcePatch: Patch): Patch {
  const existingOutputPort = getPatchOutputPort(sourcePatch);

  return createClearPatch({
    id: sourcePatch.id,
    name: sourcePatch.name,
    meta: sourcePatch.meta,
    outputNodeId: existingOutputPort?.id ?? "out1",
    canvasZoom: sourcePatch.ui.canvasZoom
  });
}
