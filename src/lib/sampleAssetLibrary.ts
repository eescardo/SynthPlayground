import { createId } from "@/lib/ids";
import { Project } from "@/types/music";
import { Patch, PatchValidationIssue } from "@/types/patch";
import { ProjectAssetLibrary } from "@/types/assets";

const SAMPLE_PLAYER_NODE_TYPE = "SamplePlayer";

export function createEmptyProjectAssetLibrary(): ProjectAssetLibrary {
  return {
    samplePlayerById: {}
  };
}

export function getSamplePlayerAssetData(assets: ProjectAssetLibrary, assetId: string | null | undefined) {
  if (!assetId) {
    return undefined;
  }
  return assets.samplePlayerById[assetId];
}

export function upsertSamplePlayerAssetData(
  assets: ProjectAssetLibrary,
  serializedSampleData: string,
  existingAssetId?: string | null
) {
  const assetId = existingAssetId || createId("sampleAsset");
  return {
    assetId,
    assets: {
      ...assets,
      samplePlayerById: {
        ...assets.samplePlayerById,
        [assetId]: serializedSampleData
      }
    }
  };
}

export function extractInlineSamplePlayerAssets(
  project: Project,
  assets: ProjectAssetLibrary
): { project: Project; assets: ProjectAssetLibrary; migrated: boolean } {
  let nextAssets = assets;
  let migrated = false;
  const nextPatches = project.patches.map((patch) => {
    let patchChanged = false;
    const nextNodes = patch.nodes.map((node) => {
      if (node.typeId !== SAMPLE_PLAYER_NODE_TYPE) {
        return node;
      }
      const inlineSampleData = typeof node.params.sampleData === "string" ? node.params.sampleData : "";
      if (!inlineSampleData) {
        return node;
      }
      const existingAssetId = typeof node.params.sampleAssetId === "string" ? node.params.sampleAssetId : undefined;
      const { assetId, assets: updatedAssets } = upsertSamplePlayerAssetData(nextAssets, inlineSampleData, existingAssetId);
      nextAssets = updatedAssets;
      patchChanged = true;
      migrated = true;
      const nextParams: Record<string, number | string | boolean> = { ...node.params, sampleAssetId: assetId };
      delete nextParams.sampleData;
      return {
        ...node,
        params: nextParams
      };
    });
    return patchChanged ? { ...patch, nodes: nextNodes } : patch;
  });

  return {
    project: migrated ? { ...project, patches: nextPatches } : project,
    assets: nextAssets,
    migrated
  };
}

export function collectReferencedSamplePlayerAssetIds(project: Project) {
  const ids = new Set<string>();
  for (const patch of project.patches) {
    for (const node of patch.nodes) {
      if (node.typeId !== SAMPLE_PLAYER_NODE_TYPE) {
        continue;
      }
      const assetId = typeof node.params.sampleAssetId === "string" ? node.params.sampleAssetId : "";
      if (assetId) {
        ids.add(assetId);
      }
    }
  }
  return ids;
}

export function pickReferencedProjectAssets(project: Project, assets: ProjectAssetLibrary): ProjectAssetLibrary {
  const referencedIds = collectReferencedSamplePlayerAssetIds(project);
  const samplePlayerById = Object.fromEntries(
    Array.from(referencedIds)
      .map((assetId) => [assetId, assets.samplePlayerById[assetId]] as const)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  return { samplePlayerById };
}

export function hydratePatchSamplePlayerAssetsForRuntime(patch: Patch, assets: ProjectAssetLibrary): Patch {
  let patchChanged = false;
  const nextNodes = patch.nodes.map((node) => {
    if (node.typeId !== SAMPLE_PLAYER_NODE_TYPE) {
      return node;
    }
    const assetId = typeof node.params.sampleAssetId === "string" ? node.params.sampleAssetId : "";
    const resolvedSampleData = getSamplePlayerAssetData(assets, assetId) ?? "";
    const currentSampleData = typeof node.params.sampleData === "string" ? node.params.sampleData : "";
    if (currentSampleData === resolvedSampleData) {
      return node;
    }
    patchChanged = true;
    return {
      ...node,
      params: {
        ...node.params,
        sampleData: resolvedSampleData
      }
    };
  });
  return patchChanged ? { ...patch, nodes: nextNodes } : patch;
}

export function buildMissingSampleAssetIssues(patch: Patch, assets: ProjectAssetLibrary): PatchValidationIssue[] {
  const issues: PatchValidationIssue[] = [];
  for (const node of patch.nodes) {
    if (node.typeId !== SAMPLE_PLAYER_NODE_TYPE) {
      continue;
    }
    const assetId = typeof node.params.sampleAssetId === "string" ? node.params.sampleAssetId : "";
    if (!assetId || getSamplePlayerAssetData(assets, assetId)) {
      continue;
    }
    issues.push({
      level: "error",
      code: "sample-asset-missing",
      message: `Sample asset not found for ${node.id}. Re-import the sample to restore playback.`,
      context: {
        nodeId: node.id,
        assetId
      }
    });
  }
  return issues;
}
