import { clampBipolar } from "@/lib/numeric";
import { SamplePlayerAssetData, SerializedSamplePlayerAssetData } from "@/types/assets";

export interface DecodedSampleAsset {
  name: string;
  sourceUrl?: string;
  sampleRate: number;
  samples: Float32Array;
}

const SAMPLE_BINARY_DATA_VERSION = 2;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bytesToBase64 = (bytes: Uint8Array) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) => {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const cloneSamples = (samples: Float32Array) => new Float32Array(samples);

export function createSamplePlayerAssetData(asset: DecodedSampleAsset): SamplePlayerAssetData {
  return {
    version: SAMPLE_BINARY_DATA_VERSION,
    name: asset.name,
    sourceUrl: asset.sourceUrl,
    sampleRate: asset.sampleRate,
    samples: cloneSamples(asset.samples)
  };
}

export function serializeSamplePlayerAssetForJson(asset: SamplePlayerAssetData): SerializedSamplePlayerAssetData {
  return {
    version: SAMPLE_BINARY_DATA_VERSION,
    name: asset.name,
    sourceUrl: asset.sourceUrl,
    sampleRate: asset.sampleRate,
    encoding: "f32le-base64",
    samples: bytesToBase64(new Uint8Array(asset.samples.buffer, asset.samples.byteOffset, asset.samples.byteLength))
  };
}

export function normalizeSamplePlayerAssetData(raw: unknown): SamplePlayerAssetData | null {
  if (isObject(raw) && raw.version === SAMPLE_BINARY_DATA_VERSION) {
    const sampleRate = typeof raw.sampleRate === "number" && Number.isFinite(raw.sampleRate) ? raw.sampleRate : 0;
    const name = typeof raw.name === "string" ? raw.name : "";
    if (!name || sampleRate <= 0) {
      return null;
    }

    let samples: Float32Array | null = null;
    if (raw.samples instanceof Float32Array) {
      samples = cloneSamples(raw.samples);
    } else if (raw.encoding === "f32le-base64" && typeof raw.samples === "string" && raw.samples.length > 0) {
      try {
        const bytes = base64ToBytes(raw.samples);
        const alignedBytes = bytes.byteOffset % Float32Array.BYTES_PER_ELEMENT === 0 ? bytes : new Uint8Array(bytes);
        samples = new Float32Array(
          alignedBytes.buffer,
          alignedBytes.byteOffset,
          Math.floor(alignedBytes.byteLength / Float32Array.BYTES_PER_ELEMENT)
        );
        samples = cloneSamples(samples);
      } catch {
        return null;
      }
    }

    if (!samples || samples.length === 0) {
      return null;
    }
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = clampBipolar(Number.isFinite(samples[index]) ? samples[index] : 0);
    }
    return {
      version: SAMPLE_BINARY_DATA_VERSION,
      name,
      sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : undefined,
      sampleRate,
      samples
    };
  }

  return null;
}

export function areSamplePlayerAssetsEqual(left: SamplePlayerAssetData, right: SamplePlayerAssetData) {
  if (
    left.sampleRate !== right.sampleRate ||
    left.name !== right.name ||
    left.sourceUrl !== right.sourceUrl ||
    left.samples.length !== right.samples.length
  ) {
    return false;
  }
  for (let index = 0; index < left.samples.length; index += 1) {
    if (left.samples[index] !== right.samples[index]) {
      return false;
    }
  }
  return true;
}
