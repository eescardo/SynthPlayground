"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSampleWaveformPeaks,
  decodeSamplePlayerFile,
  decodeSamplePlayerUrl,
  formatSampleDuration,
  parseSamplePlayerData,
  previewSampleAsset,
  resolveSampleTrimRange,
  samplePlayerPitchSemisToRootPitch,
  samplePlayerRootPitchToPitchSemis,
  serializeSamplePlayerData
} from "@/lib/patch/samplePlayer";
import { usePatchWorkspaceSampleAssets } from "@/components/patch/PatchWorkspaceContext";
import { detectDominantSamplePitches } from "@/lib/patch/pitchTracker";
import { PatchNode } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface SamplePlayerInspectorSectionProps {
  node: PatchNode;
  structureLocked?: boolean;
  onApplyOp: (op: PatchOp) => void;
}

type SamplePlayerStatus = {
  tone: "info" | "success" | "error";
  message: string;
} | null;

export function SamplePlayerInspectorSection(props: SamplePlayerInspectorSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { assets, upsertSamplePlayerAssetData } = usePatchWorkspaceSampleAssets();
  const sampleAssetId = typeof props.node.params.sampleAssetId === "string" ? props.node.params.sampleAssetId : "";
  const rawSampleData = sampleAssetId ? assets.samplePlayerById[sampleAssetId] : undefined;
  const sampleAsset = useMemo(
    () => parseSamplePlayerData(rawSampleData),
    [rawSampleData]
  );
  const sampleAssetMissing = Boolean(sampleAssetId) && !sampleAsset;
  const [sourceUrl, setSourceUrl] = useState(sampleAsset?.sourceUrl ?? "");
  const [status, setStatus] = useState<SamplePlayerStatus>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSourceUrl(sampleAsset?.sourceUrl ?? "");
  }, [sampleAsset?.sourceUrl]);

  const startRatio = typeof props.node.params.start === "number" ? props.node.params.start : 0;
  const endRatio = typeof props.node.params.end === "number" ? props.node.params.end : 1;
  const [draftStartRatio, setDraftStartRatio] = useState(startRatio);
  const [draftEndRatio, setDraftEndRatio] = useState(endRatio);

  useEffect(() => {
    setDraftStartRatio(startRatio);
  }, [startRatio]);

  useEffect(() => {
    setDraftEndRatio(endRatio);
  }, [endRatio]);

  const visualTrim = sampleAsset ? resolveSampleTrimRange(sampleAsset, draftStartRatio, draftEndRatio) : null;
  const trim = sampleAsset ? resolveSampleTrimRange(sampleAsset, startRatio, endRatio) : null;
  const waveformPeaks = useMemo(
    () => (sampleAsset ? buildSampleWaveformPeaks(sampleAsset.samples) : []),
    [sampleAsset]
  );
  const trimmedSamples = useMemo(() => {
    if (!sampleAsset || !visualTrim) {
      return undefined;
    }
    const { startSample, endSample } = visualTrim;
    return sampleAsset.samples.slice(startSample, endSample);
  }, [sampleAsset, visualTrim]);
  const dominantPitches = useMemo(
    () => detectDominantSamplePitches(trimmedSamples, sampleAsset?.sampleRate),
    [trimmedSamples, sampleAsset?.sampleRate]
  );
  const pitchSemis = typeof props.node.params.pitchSemis === "number" ? props.node.params.pitchSemis : 0;
  const rootPitch = samplePlayerPitchSemisToRootPitch(pitchSemis);

  const storeSample = (sampleData: string) => {
    const nextAssetId = upsertSamplePlayerAssetData(sampleData);
    props.onApplyOp({
      type: "setParams",
      nodeId: props.node.id,
      values: {
        sampleAssetId: nextAssetId,
        start: 0,
        end: 1
      }
    });
  };

  const importFile = async (file: File) => {
    setLoading(true);
    setStatus({ tone: "info", message: "Importing sample..." });
    try {
      const decoded = await decodeSamplePlayerFile(file);
      storeSample(serializeSamplePlayerData(decoded));
      setStatus({ tone: "success", message: `Loaded ${decoded.name}` });
    } catch (error) {
      setStatus({ tone: "error", message: formatSamplePlayerError(error, file.name) });
    } finally {
      setLoading(false);
    }
  };

  const importUrl = async () => {
    const nextUrl = sourceUrl.trim();
    if (!nextUrl) {
      setStatus({ tone: "error", message: "Enter a sample URL first." });
      return;
    }
    setLoading(true);
    setStatus({ tone: "info", message: "Fetching sample..." });
    try {
      const decoded = await decodeSamplePlayerUrl(nextUrl);
      storeSample(serializeSamplePlayerData(decoded));
      setStatus({ tone: "success", message: `Loaded ${decoded.name}` });
    } catch (error) {
      setStatus({ tone: "error", message: formatSamplePlayerError(error, nextUrl) });
    } finally {
      setLoading(false);
    }
  };

  const previewSample = async () => {
    if (sampleAssetMissing) {
      setStatus({ tone: "error", message: `Sample asset not found for id ${sampleAssetId}. Re-import it to restore playback.` });
      return;
    }
    if (!sampleAsset || !trim) {
      setStatus({ tone: "error", message: "Load a sample first." });
      return;
    }
    setStatus({ tone: "info", message: "Previewing trimmed sample..." });
    try {
      await previewSampleAsset(sampleAsset, {
        startRatio,
        endRatio,
        loop: props.node.params.mode === "loop"
      });
    } catch (error) {
      setStatus({ tone: "error", message: formatSamplePlayerError(error, sampleAsset.name) });
    }
  };

  return (
    <>
      <div className="param-row">
        <span>Sample Source</span>
        <div className="param-control-stack">
          <input
            type="url"
            value={sourceUrl}
            placeholder="https://example.com/sample.wav"
            disabled={props.structureLocked || loading}
            onChange={(event) => setSourceUrl(event.target.value)}
          />
          <div className="macro-binding-edit-summary">
            {sampleAsset
              ? `${sampleAsset.name} · ${formatSampleDuration(sampleAsset.samples.length / sampleAsset.sampleRate)} · ${sampleAsset.sampleRate.toLocaleString()} Hz mono`
              : sampleAssetMissing
                ? `Missing sample asset: ${sampleAssetId}`
              : "Load from a URL or import a local file. The decoded sample is stored inside this patch."}
          </div>
        </div>
        <button type="button" disabled={props.structureLocked || loading} onClick={importUrl}>
          Load URL
        </button>
      </div>
      <div className="param-row">
        <span>Local File</span>
        <div className="param-control-stack">
          <button type="button" disabled={props.structureLocked || loading} onClick={() => fileInputRef.current?.click()}>
            Import Audio File
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="audio/*,.wav,.aif,.aiff,.mp3,.m4a,.ogg,.flac"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
          <div className="macro-binding-edit-summary">
            {visualTrim
              ? `Trimmed playback: ${formatSampleDuration(visualTrim.startSample / (sampleAsset?.sampleRate ?? 1))} to ${formatSampleDuration(visualTrim.endSample / (sampleAsset?.sampleRate ?? 1))}`
              : "Imported files are downmixed to mono for the current SamplePlayer."}
          </div>
        </div>
        <button
          type="button"
          disabled={props.structureLocked || !sampleAssetId}
          onClick={() =>
            props.onApplyOp({
              type: "setParams",
              nodeId: props.node.id,
              values: {
                sampleAssetId: "",
                start: 0,
                end: 1
              }
            })
          }
        >
          Clear
        </button>
      </div>
      <SampleTrimControls
        disabled={props.structureLocked || !sampleAsset}
        startRatio={draftStartRatio}
        endRatio={draftEndRatio}
        onChangeStart={setDraftStartRatio}
        onChangeEnd={setDraftEndRatio}
        onCommitStart={(nextStartRatio) => {
          if (nextStartRatio !== startRatio) {
            props.onApplyOp({ type: "setParam", nodeId: props.node.id, paramId: "start", value: nextStartRatio });
          }
        }}
        onCommitEnd={(nextEndRatio) => {
          if (nextEndRatio !== endRatio) {
            props.onApplyOp({ type: "setParam", nodeId: props.node.id, paramId: "end", value: nextEndRatio });
          }
        }}
      />
      <div className="param-row">
        <span>Preview Sample</span>
        <div className="param-control-stack">
          <SampleWaveform peaks={waveformPeaks} startRatio={draftStartRatio} endRatio={draftEndRatio} />
          <div className={`sample-player-status${status ? ` ${status.tone}` : ""}`}>
            {status?.message ?? "This preview plays the trimmed sample directly, separate from patch note preview."}
          </div>
          <div className="sample-player-detected-pitches">
            <div className="macro-binding-edit-summary">
              {dominantPitches.length
                ? "Detected dominant pitches in the trimmed region. Click one to treat the sample as that root note."
                : sampleAssetMissing
                  ? "This patch references a missing sample asset. Re-import a file or URL to restore it."
                : sampleAsset
                  ? "Pitch detection works best on a monophonic trimmed phrase with audible note gaps."
                  : "Load a sample to analyze trimmed pitches."}
            </div>
            {dominantPitches.length > 0 && (
              <div className="sample-player-pitch-chip-list">
                {dominantPitches.map((pitch) => {
                  const isActive = pitch.suggestedPitchSemis === pitchSemis;
                  return (
                    <button
                      key={pitch.pitchStr}
                      type="button"
                      className={`sample-player-pitch-chip${isActive ? " active" : ""}`}
                      disabled={props.structureLocked}
                      onClick={() =>
                        props.onApplyOp({
                          type: "setParam",
                          nodeId: props.node.id,
                          paramId: "pitchSemis",
                          value: samplePlayerRootPitchToPitchSemis(pitch.pitchStr)
                        })
                      }
                    >
                      <strong>{pitch.pitchStr}</strong>
                      <span>{pitch.totalDurationSeconds.toFixed(2)}s</span>
                      <span>{pitch.noteCount} note{pitch.noteCount === 1 ? "" : "s"}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="macro-binding-edit-summary">
              Current root: {rootPitch}. Incoming note pitch then resamples this sample around that root.
            </div>
          </div>
        </div>
        <button type="button" disabled={!sampleAsset || loading} onClick={() => void previewSample()}>
          Preview
        </button>
      </div>
    </>
  );
}

function SampleWaveform(props: { peaks: number[]; startRatio: number; endRatio: number }) {
  if (props.peaks.length === 0) {
    return <div className="sample-waveform-placeholder">No sample loaded</div>;
  }
  const bars = props.peaks.map((peak, index) => {
    const x = (index / Math.max(1, props.peaks.length - 1)) * 100;
    const active = x >= props.startRatio * 100 && x <= props.endRatio * 100;
    const height = Math.max(6, peak * 44);
    return (
      <line
        key={index}
        x1={x}
        y1={30 - height / 2}
        x2={x}
        y2={30 + height / 2}
        stroke={active ? "rgba(200, 255, 57, 0.95)" : "rgba(141, 165, 183, 0.4)"}
        strokeWidth="0.9"
        vectorEffect="non-scaling-stroke"
      />
    );
  });

  return (
    <svg viewBox="0 0 100 60" className="sample-waveform-preview" aria-label="Sample waveform preview">
      <rect x="0" y="0" width="100" height="60" rx="6" fill="rgba(10, 18, 28, 0.92)" />
      <rect
        x={props.startRatio * 100}
        y="4"
        width={Math.max(1, (props.endRatio - props.startRatio) * 100)}
        height="52"
        rx="4"
        fill="rgba(200, 255, 57, 0.08)"
      />
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(141, 165, 183, 0.18)" strokeWidth="0.4" />
      {bars}
    </svg>
  );
}

function SampleTrimControls(props: {
  disabled?: boolean;
  startRatio: number;
  endRatio: number;
  onChangeStart: (value: number) => void;
  onChangeEnd: (value: number) => void;
  onCommitStart: (value: number) => void;
  onCommitEnd: (value: number) => void;
}) {
  const commitStart = (nextStartRatio: number) => {
    const clampedStartRatio = Math.min(nextStartRatio, props.endRatio);
    props.onChangeStart(clampedStartRatio);
    props.onCommitStart(clampedStartRatio);
  };

  const commitEnd = (nextEndRatio: number) => {
    const clampedEndRatio = Math.max(nextEndRatio, props.startRatio);
    props.onChangeEnd(clampedEndRatio);
    props.onCommitEnd(clampedEndRatio);
  };

  return (
    <>
      <div className="param-row">
        <span>Start</span>
        <div className="param-control-stack">
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={props.startRatio}
            disabled={props.disabled}
            onChange={(event) => props.onChangeStart(Math.min(Number(event.target.value), props.endRatio))}
            onPointerUp={(event) => commitStart(Number(event.currentTarget.value))}
            onBlur={(event) => commitStart(Number(event.currentTarget.value))}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                commitStart(Number(event.currentTarget.value));
              }
            }}
          />
          <div className="macro-binding-edit-summary">Trim start: {(props.startRatio * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div className="param-row">
        <span>End</span>
        <div className="param-control-stack">
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={props.endRatio}
            disabled={props.disabled}
            onChange={(event) => props.onChangeEnd(Math.max(Number(event.target.value), props.startRatio))}
            onPointerUp={(event) => commitEnd(Number(event.currentTarget.value))}
            onBlur={(event) => commitEnd(Number(event.currentTarget.value))}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                commitEnd(Number(event.currentTarget.value));
              }
            }}
          />
          <div className="macro-binding-edit-summary">Trim end: {(props.endRatio * 100).toFixed(1)}%</div>
        </div>
      </div>
    </>
  );
}

function formatSamplePlayerError(error: unknown, source: string) {
  const message = error instanceof Error ? error.message : String(error);
  return `Could not load ${source}: ${message || "unknown error"}`;
}
