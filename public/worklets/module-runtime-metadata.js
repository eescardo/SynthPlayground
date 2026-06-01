// Generated from src/lib/patch/module-runtime-metadata.js by scripts/worklets/sync-worklet-runtime.mjs.
export const INTRINSIC_PARAMS_BY_TYPE = {
  SamplePlayer: [
    {
      id: "sampleAssetId",
      label: "Sample asset",
      kind: "assetRef",
      assetKind: "samplePlayer",
      doc: "References the loaded sample asset"
    }
  ]
};

export const getIntrinsicParamsForType = (typeId) => INTRINSIC_PARAMS_BY_TYPE[typeId] || [];
