"use client";

export interface SerializedSamplePlayerData {
  version: 1;
  name: string;
  sourceUrl?: string;
  sampleRate: number;
  samples: number[];
}

export interface DecodedSampleAsset {
  name: string;
  sourceUrl?: string;
  sampleRate: number;
  samples: Float32Array;
}

const SAMPLE_DATA_VERSION = 1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function parseSamplePlayerData(raw: string | null | undefined): DecodedSampleAsset | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedSamplePlayerData>;
    if (
      parsed.version !== SAMPLE_DATA_VERSION ||
      typeof parsed.name !== "string" ||
      typeof parsed.sampleRate !== "number" ||
      !Number.isFinite(parsed.sampleRate) ||
      parsed.sampleRate <= 0 ||
      !Array.isArray(parsed.samples)
    ) {
      return null;
    }
    const samples = Float32Array.from(
      parsed.samples.map((sample) => (typeof sample === "number" && Number.isFinite(sample) ? clamp(sample, -1, 1) : 0))
    );
    if (samples.length === 0) {
      return null;
    }
    return {
      name: parsed.name,
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : undefined,
      sampleRate: parsed.sampleRate,
      samples
    };
  } catch {
    return null;
  }
}

export function serializeSamplePlayerData(asset: DecodedSampleAsset): string {
  const payload: SerializedSamplePlayerData = {
    version: SAMPLE_DATA_VERSION,
    name: asset.name,
    sourceUrl: asset.sourceUrl,
    sampleRate: asset.sampleRate,
    samples: Array.from(asset.samples, (sample) => Number(sample.toFixed(6)))
  };
  return JSON.stringify(payload);
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
    window.setTimeout(() => {
      try {
        source.stop();
      } catch {
        // Ignore if already stopped.
      }
    }, Math.min(4000, Math.round((trim.durationSamples / asset.sampleRate) * 2000)));
  }
}
