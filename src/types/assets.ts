export interface SamplePlayerAssetData {
  version: 2;
  name: string;
  sourceUrl?: string;
  sampleRate: number;
  samples: Float32Array;
}

export interface ProjectAssetLibrary {
  samplePlayerById: Record<string, SamplePlayerAssetData>;
}
