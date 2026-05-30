"use client";

import { clamp, clampBipolar } from "@/lib/numeric";
import { midiToPitch, pitchToMidi } from "@/lib/pitch";
import { SamplePlayerAssetData } from "@/types/assets";

export interface DecodedSampleAsset {
  name: string;
  sourceUrl?: string;
  sampleRate: number;
  samples: Float32Array;
}

interface SerializedSamplePlayerBinaryData {
  version: 2;
  name: string;
  sourceUrl?: string;
  sampleRate: number;
  encoding: "f32le-base64";
  samples: string;
}

const SAMPLE_BINARY_DATA_VERSION = 2;
export const SAMPLE_PLAYER_PITCH_ANALYSIS_MAX_SECONDS = 0.75;

export function samplePlayerPitchSemisToRootPitch(pitchSemis: number) {
  return midiToPitch(Math.round(60 - clamp(pitchSemis, -48, 48)));
}

export function samplePlayerRootPitchToPitchSemis(pitchStr: string) {
  return clamp(60 - pitchToMidi(pitchStr), -48, 48);
}

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

export function serializeSamplePlayerAssetForJson(asset: SamplePlayerAssetData): SerializedSamplePlayerBinaryData {
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
    } else if (raw.samples instanceof ArrayBuffer) {
      samples = new Float32Array(raw.samples.slice(0));
    } else if (raw.encoding === "f32le-base64" && typeof raw.samples === "string" && raw.samples.length > 0) {
      const bytes = base64ToBytes(raw.samples);
      const alignedBytes = bytes.byteOffset % Float32Array.BYTES_PER_ELEMENT === 0 ? bytes : new Uint8Array(bytes);
      samples = new Float32Array(
        alignedBytes.buffer,
        alignedBytes.byteOffset,
        Math.floor(alignedBytes.byteLength / Float32Array.BYTES_PER_ELEMENT)
      );
      samples = cloneSamples(samples);
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

export function parseSamplePlayerData(raw: SamplePlayerAssetData | null | undefined): DecodedSampleAsset | null {
  const asset = normalizeSamplePlayerAssetData(raw);
  if (!asset) {
    return null;
  }
  return {
    name: asset.name,
    sourceUrl: asset.sourceUrl,
    sampleRate: asset.sampleRate,
    samples: asset.samples
  };
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

function downmixAudioBuffer(buffer: AudioBuffer) {
  const output = new Float32Array(buffer.length);
  const channelCount = Math.max(1, buffer.numberOfChannels);
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let index = 0; index < buffer.length; index += 1) {
      output[index] += channel[index] / channelCount;
    }
  }
  return output;
}

let decodeContextPromise: Promise<AudioContext> | null = null;

async function getDecodeContext() {
  if (!decodeContextPromise) {
    decodeContextPromise = Promise.resolve(new AudioContext());
  }
  return decodeContextPromise;
}

export async function decodeSamplePlayerArrayBuffer(
  arrayBuffer: ArrayBuffer,
  metadata: { name: string; sourceUrl?: string }
): Promise<DecodedSampleAsset> {
  const context = await getDecodeContext();
  const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
  return {
    name: metadata.name,
    sourceUrl: metadata.sourceUrl,
    sampleRate: decoded.sampleRate,
    samples: downmixAudioBuffer(decoded)
  };
}

export async function decodeSamplePlayerFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  return decodeSamplePlayerArrayBuffer(arrayBuffer, { name: file.name });
}

export async function decodeSamplePlayerUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sample (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  })();
  const fallbackName = pathname.split("/").filter(Boolean).at(-1) || "remote-sample";
  return decodeSamplePlayerArrayBuffer(arrayBuffer, {
    name: fallbackName,
    sourceUrl: url
  });
}

export function resolveSampleTrimRange(sample: DecodedSampleAsset, startRatio: number, endRatio: number) {
  const sampleCount = sample.samples.length;
  const safeStartRatio = clamp(startRatio, 0, 1);
  const safeEndRatio = clamp(endRatio, safeStartRatio + 1 / Math.max(sampleCount, 1), 1);
  const startSample = clamp(Math.floor(safeStartRatio * sampleCount), 0, Math.max(0, sampleCount - 1));
  const endSample = clamp(Math.ceil(safeEndRatio * sampleCount), startSample + 1, sampleCount);
  return {
    startRatio: safeStartRatio,
    endRatio: safeEndRatio,
    startSample,
    endSample,
    durationSamples: Math.max(1, endSample - startSample)
  };
}

export function resolveSamplePitchAnalysisSamples(
  sample: DecodedSampleAsset,
  startRatio: number,
  endRatio: number,
  maxDurationSeconds = SAMPLE_PLAYER_PITCH_ANALYSIS_MAX_SECONDS
) {
  const trim = resolveSampleTrimRange(sample, startRatio, endRatio);
  const maxAnalysisSamples = Math.max(1, Math.floor(sample.sampleRate * Math.max(0.01, maxDurationSeconds)));
  return sample.samples.subarray(trim.startSample, Math.min(trim.endSample, trim.startSample + maxAnalysisSamples));
}

export function formatSampleDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0.00s";
  }
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
  }
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
}

export function buildSampleWaveformPeaks(samples: ArrayLike<number>, bucketCount = 96) {
  if (samples.length === 0 || bucketCount <= 0) {
    return [];
  }
  const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
  const peaks = [];
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = bucketIndex * bucketSize;
    const end = bucketIndex === bucketCount - 1 ? samples.length : Math.min(samples.length, start + bucketSize);
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(Number(samples[index] ?? 0)));
    }
    peaks.push(peak);
  }
  return peaks;
}

let previewContextPromise: Promise<AudioContext> | null = null;

async function getPreviewContext() {
  if (!previewContextPromise) {
    previewContextPromise = Promise.resolve(new AudioContext());
  }
  return previewContextPromise;
}

export async function previewSampleAsset(
  asset: DecodedSampleAsset,
  options?: { startRatio?: number; endRatio?: number; loop?: boolean }
) {
  const context = await getPreviewContext();
  if (context.state !== "running") {
    await context.resume();
  }
  const trim = resolveSampleTrimRange(asset, options?.startRatio ?? 0, options?.endRatio ?? 1);
  const buffer = context.createBuffer(1, asset.samples.length, asset.sampleRate);
  buffer.getChannelData(0).set(asset.samples);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = Boolean(options?.loop);
  source.loopStart = trim.startSample / asset.sampleRate;
  source.loopEnd = trim.endSample / asset.sampleRate;
  source.connect(context.destination);
  source.start(0, trim.startSample / asset.sampleRate, trim.durationSamples / asset.sampleRate);
  if (source.loop) {
    window.setTimeout(
      () => {
        try {
          source.stop();
        } catch {
          // Ignore if already stopped.
        }
      },
      Math.min(4000, Math.round((trim.durationSamples / asset.sampleRate) * 2000))
    );
  }
}
