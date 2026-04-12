"use client";

import { ChangeEvent } from "react";
import { formatBeatName } from "@/lib/musicTiming";

interface TransportBarProps {
  tempo: number;
  meter: "4/4" | "3/4";
  gridBeats: number;
  isPlaying: boolean;
  recordEnabled: boolean;
  recordPhase?: "idle" | "count_in" | "recording";
  countInLabel?: string | null;
  playheadBeat: number;
  onPlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onOpenPatchWorkspace: () => void;
  onExportAudio: () => void;
  exportAudioDisabled?: boolean;
  onTempoChange: (value: number) => void;
  onMeterChange: (value: "4/4" | "3/4") => void;
  onGridChange: (value: number) => void;
  onOpenHelp: () => void;
}

interface RecordButtonProps {
  recordEnabled: boolean;
  recordPhase?: "idle" | "count_in" | "recording";
  countInLabel?: string | null;
  onToggleRecord: () => void;
}

function RecordButton(props: RecordButtonProps) {
  return (
    <div className="record-button-wrap">
      {props.recordPhase === "count_in" && props.countInLabel && (
        <div className="record-countdown-badge" aria-live="polite">
          {props.countInLabel}
        </div>
      )}
      <button
        className={props.recordEnabled ? "armed toggle-active" : ""}
        aria-pressed={props.recordEnabled}
        onClick={props.onToggleRecord}
      >
        Record
      </button>
    </div>
  );
}

export function TransportBar(props: TransportBarProps) {
  const onTempoInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    props.onTempoChange(Math.max(40, Math.min(220, next)));
  };

  const onGridInput = (event: ChangeEvent<HTMLSelectElement>) => {
    props.onGridChange(Number(event.target.value));
  };

  return (
    <div className="transport">
      <div className="transport-left">
        <button onClick={props.onPlay} disabled={props.isPlaying || props.recordEnabled}>
          Play
        </button>
        <button onClick={props.onStop} disabled={!props.isPlaying || props.recordEnabled}>
          Stop
        </button>
        <RecordButton
          recordEnabled={props.recordEnabled}
          recordPhase={props.recordPhase}
          countInLabel={props.countInLabel}
          onToggleRecord={props.onToggleRecord}
        />
        <span className="playhead">Beat {formatBeatName(props.playheadBeat, props.gridBeats)}</span>
      </div>

      <div className="transport-right">
        <button onClick={props.onOpenHelp}>Help (?)</button>

        <label>
          Tempo
          <input type="number" min={40} max={220} value={props.tempo} onChange={onTempoInput} />
        </label>

        <label>
          Meter
          <select value={props.meter} onChange={(e) => props.onMeterChange(e.target.value as "4/4" | "3/4")}>
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
          </select>
        </label>

        <label>
          Grid
          <select value={props.gridBeats} onChange={onGridInput}>
            <option value={1}>1/4</option>
            <option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option>
            <option value={0.125}>1/32</option>
          </select>
        </label>

        <button onClick={props.onOpenPatchWorkspace}>Open Patch Workspace</button>

        <button className="transport-export-button" onClick={props.onExportAudio} disabled={props.exportAudioDisabled}>
          Export audio...
        </button>
      </div>
    </div>
  );
}
