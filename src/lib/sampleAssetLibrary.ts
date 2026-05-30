import { createId } from "@/lib/ids";
import {
  areSamplePlayerAssetsEqual,
  normalizeSamplePlayerAssetData,
  serializeSamplePlayerAssetForJson
} from "@/lib/patch/samplePlayer";
import { Project } from "@/types/music";
import { Patch, PatchValidationIssue } from "@/types/patch";
import { ProjectAssetLibrary, SamplePlayerAssetData } from "@/types/assets";

const SAMPLE_PLAYER_NODE_TYPE = "SamplePlayer";

export function createEmptyProjectAssetLibrary(): ProjectAssetLibrary {
  return {
    samplePlayerById: {}
  };
}

export function normalizeProjectAssetLibrary(raw: unknown): ProjectAssetLibrary {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return createEmptyProjectAssetLibrary();
  }
  const rawSamplePlayerById =
    "samplePlayerById" in raw &&
    typeof raw.samplePlayerById === "object" &&
    raw.samplePlayerById !== null &&
    !Array.isArray(raw.samplePlayerById)
      ? raw.samplePlayerById
      : {};
  const samplePlayerById = Object.fromEntries(
    Object.entries(rawSamplePlayerById).flatMap(([assetId, value]) => {
      const normalized = normalizeSamplePlayerAssetData(value);
      return normalized ? [[assetId, normalized] as const] : [];
    })
  );

  return { samplePlayerById };
}

export function serializeProjectAssetLibraryForJson(assets: ProjectAssetLibrary): unknown {
  return {
    samplePlayerById: Object.fromEntries(
      Object.entries(assets.samplePlayerById).map(([assetId, asset]) => [
        assetId,
        serializeSamplePlayerAssetForJson(asset)
      ])
    )
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
  sampleData: SamplePlayerAssetData,
  existingAssetId?: string | null
) {
  const assetId = existingAssetId || createId("sampleAsset");
  return {
    assetId,
    assets: {
      ...assets,
      samplePlayerById: {
        ...assets.samplePlayerById,
        [assetId]: sampleData
      }
    }
  };
}

export function collectReferencedSamplePlayerAssetIds(project: Project) {
  const ids = new Set<string>();
  for (const patch of project.patches) {
    for (const assetId of collectReferencedPatchSamplePlayerAssetIds(patch)) {
      ids.add(assetId);
    }
  }
  return ids;
}

export function collectReferencedPatchSamplePlayerAssetIds(patch: Patch) {
  const ids = new Set<string>();
  for (const node of patch.nodes) {
    if (node.typeId !== SAMPLE_PLAYER_NODE_TYPE) {
      continue;
    }
    const assetId = typeof node.params.sampleAssetId === "string" ? node.params.sampleAssetId : "";
    if (assetId) {
      ids.add(assetId);
    }
  }
  return ids;
}

export function pickReferencedProjectAssets(project: Project, assets: ProjectAssetLibrary): ProjectAssetLibrary {
  const referencedIds = collectReferencedSamplePlayerAssetIds(project);
  const samplePlayerById = Object.fromEntries(
    Array.from(referencedIds)
      .map((assetId) => [assetId, assets.samplePlayerById[assetId]] as const)
      .filter((entry): entry is [string, SamplePlayerAssetData] => Boolean(entry[1]))
  );
  return { samplePlayerById };
}

export function pickReferencedPatchAssets(patch: Patch, assets: ProjectAssetLibrary): ProjectAssetLibrary {
  const referencedIds = collectReferencedPatchSamplePlayerAssetIds(patch);
  const samplePlayerById = Object.fromEntries(
    Array.from(referencedIds)
      .map((assetId) => [assetId, assets.samplePlayerById[assetId]] as const)
      .filter((entry): entry is [string, SamplePlayerAssetData] => Boolean(entry[1]))
  );
  return { samplePlayerById };
}

export function mergeImportedPatchAssets(
  patch: Patch,
  importedAssets: ProjectAssetLibrary,
  currentAssets: ProjectAssetLibrary
): { patch: Patch; assets: ProjectAssetLibrary } {
  let nextAssets = currentAssets;
  const remappedAssetIds = new Map<string, string>();

  for (const importedAssetId of collectReferencedPatchSamplePlayerAssetIds(patch)) {
    const importedData = importedAssets.samplePlayerById[importedAssetId];
    if (!importedData) {
      continue;
    }

    const currentData = currentAssets.samplePlayerById[importedAssetId];
    if (currentData && areSamplePlayerAssetsEqual(currentData, importedData)) {
      remappedAssetIds.set(importedAssetId, importedAssetId);
      continue;
    }

    const matchingExistingAssetId = Object.entries(nextAssets.samplePlayerById).find(([, data]) =>
      areSamplePlayerAssetsEqual(data, importedData)
    )?.[0];
    if (matchingExistingAssetId) {
      remappedAssetIds.set(importedAssetId, matchingExistingAssetId);
      continue;
    }

    const nextAssetId = currentData ? createId("sampleAsset") : importedAssetId;
    remappedAssetIds.set(importedAssetId, nextAssetId);
    nextAssets = {
      ...nextAssets,
      samplePlayerById: {
        ...nextAssets.samplePlayerById,
        [nextAssetId]: importedData
      }
    };
  }

  if (remappedAssetIds.size === 0) {
    return { patch, assets: nextAssets };
  }

  return {
    patch: {
      ...patch,
      nodes: patch.nodes.map((node) => {
        if (node.typeId !== SAMPLE_PLAYER_NODE_TYPE) {
          return node;
        }
        const assetId = typeof node.params.sampleAssetId === "string" ? node.params.sampleAssetId : "";
        const remappedAssetId = remappedAssetIds.get(assetId);
        if (!remappedAssetId || remappedAssetId === assetId) {
          return node;
        }
        return {
          ...node,
          params: {
            ...node.params,
            sampleAssetId: remappedAssetId
          }
        };
      })
    },
    assets: nextAssets
  };
}

export function hydratePatchSamplePlayerAssetsForRuntime(patch: Patch, assets: ProjectAssetLibrary): Patch {
  void assets;
  return patch;
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
