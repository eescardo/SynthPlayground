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

export interface SerializedSamplePlayerAssetData {
  version: 2;
  name: string;
  sourceUrl?: string;
  sampleRate: number;
  encoding: "f32le-base64";
  samples: string;
}

export interface SerializedProjectAssetLibrary {
  samplePlayerById: Record<string, SerializedSamplePlayerAssetData>;
}
