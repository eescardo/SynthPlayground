"use client";

import { ChangeEvent } from "react";

interface TransportBarProps {
  tempo: number;
  meter: "4/4" | "3/4";
  gridBeats: number;
  isPlaying: boolean;
  recordEnabled: boolean;
  playheadBeat: number;
  onPlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onTempoChange: (value: number) => void;
  onMeterChange: (value: "4/4" | "3/4") => void;
  onGridChange: (value: number) => void;
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
        <button onClick={props.onPlay} disabled={props.isPlaying}>
          Play
        </button>
        <button onClick={props.onStop} disabled={!props.isPlaying}>
          Stop
        </button>
        <button className={props.recordEnabled ? "armed" : ""} onClick={props.onToggleRecord}>
          Record
        </button>
        <span className="playhead">Beat {(props.playheadBeat + 1).toFixed(2)}</span>
      </div>

      <div className="transport-right">
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
      </div>
    </div>
  );
}
