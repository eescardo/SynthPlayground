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
  serializeSamplePlayerData
} from "@/lib/patch/samplePlayer";
import { PatchNode } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface SamplePlayerInspectorSectionProps {
  node: PatchNode;
  structureLocked?: boolean;
  onApplyOp: (op: PatchOp) => void;
}

export function SamplePlayerInspectorSection(props: SamplePlayerInspectorSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sampleAsset = useMemo(
    () => parseSamplePlayerData(typeof props.node.params.sampleData === "string" ? props.node.params.sampleData : undefined),
    [props.node.params.sampleData]
  );
  const [sourceUrl, setSourceUrl] = useState(sampleAsset?.sourceUrl ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSourceUrl(sampleAsset?.sourceUrl ?? "");
  }, [sampleAsset?.sourceUrl]);

  const startRatio = typeof props.node.params.start === "number" ? props.node.params.start : 0;
  const endRatio = typeof props.node.params.end === "number" ? props.node.params.end : 1;
  const trim = sampleAsset ? resolveSampleTrimRange(sampleAsset, startRatio, endRatio) : null;
  const waveformPeaks = useMemo(
    () => (sampleAsset ? buildSampleWaveformPeaks(sampleAsset.samples) : []),
    [sampleAsset]
  );

  const storeSample = (sampleData: string) => {
    props.onApplyOp({ type: "setParam", nodeId: props.node.id, paramId: "sampleData", value: sampleData });
    props.onApplyOp({ type: "setParam", nodeId: props.node.id, paramId: "start", value: 0 });
    props.onApplyOp({ type: "setParam", nodeId: props.node.id, paramId: "end", value: 1 });
  };

  const importFile = async (file: File) => {
    setLoading(true);
    setStatus("Importing sample...");
    try {
      const decoded = await decodeSamplePlayerFile(file);
      storeSample(serializeSamplePlayerData(decoded));
      setStatus(`Loaded ${decoded.name}`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const importUrl = async () => {
    const nextUrl = sourceUrl.trim();
    if (!nextUrl) {
      setStatus("Enter a sample URL first.");
      return;
    }
    setLoading(true);
    setStatus("Fetching sample...");
    try {
      const decoded = await decodeSamplePlayerUrl(nextUrl);
      storeSample(serializeSamplePlayerData(decoded));
      setStatus(`Loaded ${decoded.name}`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const previewSample = async () => {
    if (!sampleAsset || !trim) {
      setStatus("Load a sample first.");
      return;
    }
    setStatus("Previewing trimmed sample...");
    try {
      await previewSampleAsset(sampleAsset, {
        startRatio,
        endRatio,
        loop: props.node.params.mode === "loop"
      });
    } catch (error) {
      setStatus((error as Error).message);
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
            {trim
              ? `Trimmed playback: ${formatSampleDuration(trim.startSample / (sampleAsset?.sampleRate ?? 1))} to ${formatSampleDuration(trim.endSample / (sampleAsset?.sampleRate ?? 1))}`
              : "Imported files are downmixed to mono for the current SamplePlayer."}
          </div>
        </div>
        <button
          type="button"
          disabled={props.structureLocked || !sampleAsset}
          onClick={() => props.onApplyOp({ type: "setParam", nodeId: props.node.id, paramId: "sampleData", value: "" })}
        >
          Clear
        </button>
      </div>
      <div className="param-row">
        <span>Preview Sample</span>
        <div className="param-control-stack">
          <SampleWaveform peaks={waveformPeaks} startRatio={startRatio} endRatio={endRatio} />
          <div className="macro-binding-edit-summary">
            {status ?? "This preview plays the trimmed sample directly, separate from patch note preview."}
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
