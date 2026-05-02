"use client";

import { parsePitchString } from "@/lib/pitch";

interface PitchButtonLabelProps {
  pitch: string;
}

export function PitchButtonLabel({ pitch }: PitchButtonLabelProps) {
  try {
    const parsed = parsePitchString(pitch);
    return (
      <span className="pitch-button-label">
        <span className="pitch-button-label-primary">
          {parsed.noteName}
          {parsed.octaveText}
        </span>
        {parsed.centsText ? <span className="pitch-button-label-secondary">{parsed.centsText}</span> : null}
      </span>
    );
  } catch {
    return <span className="pitch-button-label">{pitch}</span>;
  }
}
