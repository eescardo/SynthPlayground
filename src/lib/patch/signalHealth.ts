import { getPatchOutputInputPortId, getPatchOutputPort, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import { Patch } from "@/types/patch";
import { PreviewProbeCapture, PreviewProbeQualityStats, PreviewProbeRequest } from "@/types/probes";

export const OUTPUT_PRE_LIMITER_CAPTURE_ID = "__output_pre_limiter";
export const OUTPUT_POST_LIMITER_CAPTURE_ID = "__output_post_limiter";

const SILENCE_DB = -120;

export interface OutputLimiterPreview {
  pre?: PreviewProbeQualityStats;
  post?: PreviewProbeQualityStats;
  gainDb: number;
  limiterEnabled: boolean;
  drivenPeak: number;
  drivenPeakDb: number;
  drivenRms: number;
  drivenRmsDb: number;
  postPeak: number;
  postPeakDb: number;
  postRms: number;
  postRmsDb: number;
  reductionDb: number;
  reductionAverageDb: number;
  nearClipActive: boolean;
  populated: boolean;
}

export function buildOutputSignalHealthCaptureRequests(patch: Patch): PreviewProbeRequest[] {
  const outputPort = getPatchOutputPort(patch);
  if (!outputPort) {
    return [];
  }
  return [
    {
      probeId: OUTPUT_PRE_LIMITER_CAPTURE_ID,
      kind: "signal_health",
      target: {
        kind: "port",
        nodeId: outputPort.id,
        portId: getPatchOutputInputPortId(patch),
        portKind: "in"
      }
    },
    {
      probeId: OUTPUT_POST_LIMITER_CAPTURE_ID,
      kind: "signal_health",
      target: {
        kind: "port",
        nodeId: outputPort.id,
        portId: "out",
        portKind: "out"
      }
    }
  ];
}

export function resolveOutputLimiterPreview(
  patch: Patch,
  captures: Record<string, PreviewProbeCapture>
): OutputLimiterPreview | null {
  const outputPort = getPatchOutputPort(patch);
  if (!outputPort) {
    return null;
  }

  const gainDb = Number(outputPort.params?.gainDb ?? -6);
  const limiterEnabled = outputPort.params?.limiter !== false;
  const pre = captures[OUTPUT_PRE_LIMITER_CAPTURE_ID]?.qualityStats;
  const post = captures[OUTPUT_POST_LIMITER_CAPTURE_ID]?.qualityStats;
  const gain = dbToGain(gainDb);
  const drivenPeak = Math.max(0, (pre?.peak ?? 0) * gain);
  const drivenRms = Math.max(0, (pre?.rms ?? 0) * gain);
  const postPeak = Math.max(0, post?.peak ?? 0);
  const postRms = Math.max(0, post?.rms ?? 0);
  const reductionDb = drivenPeak > 0.000001 && postPeak > 0.000001 ? amplitudeToDb(postPeak / drivenPeak) : 0;
  const reductionAverageDb = drivenRms > 0.000001 && postRms > 0.000001 ? amplitudeToDb(postRms / drivenRms) : 0;

  return {
    pre,
    post,
    gainDb,
    limiterEnabled,
    drivenPeak,
    drivenPeakDb: amplitudeToDb(drivenPeak),
    drivenRms,
    drivenRmsDb: amplitudeToDb(drivenRms),
    postPeak,
    postPeakDb: post?.peakDb ?? SILENCE_DB,
    postRms,
    postRmsDb: amplitudeToDb(postRms),
    reductionDb: Math.min(0, reductionDb),
    reductionAverageDb: Math.min(0, reductionAverageDb),
    nearClipActive: isSignalHealthNearClipping(post),
    populated: Boolean(pre && post)
  };
}

export function isHiddenOutputSignalHealthCaptureId(probeId: string) {
  return probeId === OUTPUT_PRE_LIMITER_CAPTURE_ID || probeId === OUTPUT_POST_LIMITER_CAPTURE_ID;
}

export function isSignalHealthNearClipping(stats?: PreviewProbeQualityStats) {
  return Boolean(stats && (stats.clippedCount > 0 || stats.nearClipCount > 0 || stats.peak >= 0.98));
}

export function resolveSignalHealthStatus(
  stats?: PreviewProbeQualityStats
): "blank" | "clean" | "hot" | "clip" | "dc" | "rough" {
  if (!stats || stats.capturedSamples <= 0 || stats.peak <= 0.0001) {
    return "blank";
  }
  if (stats.clippedCount > 0 || stats.maxConsecutiveNearClip >= 3 || stats.peak >= 0.999) {
    return "clip";
  }
  if (stats.nearClipCount > 0 || stats.peak >= 0.9) {
    return "hot";
  }
  if (Math.abs(stats.dcOffset) >= 0.05) {
    return "dc";
  }
  if (stats.roughness >= 0.34 || stats.zeroCrossingRate >= 0.32) {
    return "rough";
  }
  return "clean";
}

export function formatDb(value: number) {
  if (!Number.isFinite(value) || value <= SILENCE_DB) {
    return "-inf dB";
  }
  return `${value.toFixed(1)} dB`;
}

export function amplitudeToDb(amplitude: number) {
  return 20 * Math.log10(Math.max(0.000001, Math.abs(amplitude)));
}

function dbToGain(db: number) {
  return 10 ** (db / 20);
}

export function isPatchOutputNodeId(nodeId?: string) {
  return nodeId === PATCH_OUTPUT_PORT_ID;
}
