"use client";

import { useMemo } from "react";
import { detectMonophonicPitchNotes } from "@/lib/patch/pitchTracker";
import { PreviewProbeCapture } from "@/types/probes";

export function PitchTrackerProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
  const notes = useMemo(() => detectMonophonicPitchNotes(props.capture, 120), [props.capture]);
  return (
    <div className={`pitch-tracker-probe${props.compact ? " compact" : ""}`}>
      <div className="pitch-tracker-probe-summary">
        {notes.length ? `${notes.length} note${notes.length === 1 ? "" : "s"} detected` : "No notes detected yet"}
      </div>
      <div className="pitch-tracker-probe-notes">
        {notes.slice(0, props.compact ? 3 : 6).map((note, index) => (
          <div key={`${note.pitchStr}_${note.startBeat}_${index}`} className="pitch-tracker-probe-note">
            <strong>{note.pitchStr}</strong>
            <span>{note.startBeat.toFixed(2)}</span>
            <span>{note.durationBeats.toFixed(2)}</span>
          </div>
        ))}
        {notes.length === 0 && <div className="pitch-tracker-probe-empty">Play a preview through this probe.</div>}
      </div>
    </div>
  );
}
