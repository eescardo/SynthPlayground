"use client";

import { midiToPitch, pitchToMidi, qwertyKeyForPitch } from "@/lib/pitch";

interface PianoKeyboardProps {
  minPitch?: string;
  maxPitch?: string;
  selectedPitch?: string;
  onSelectPitch: (pitch: string) => void;
}

interface KeyDef {
  midi: number;
  pitch: string;
  black: boolean;
}

const BLACK_SET = new Set([1, 3, 6, 8, 10]);
const WHITE_KEY_WIDTH = 20;
const WHITE_KEY_GAP = 1;
const BLACK_KEY_WIDTH = 12;

const buildKeys = (minPitch: string, maxPitch: string): KeyDef[] => {
  const minMidi = pitchToMidi(minPitch);
  const maxMidi = pitchToMidi(maxPitch);
  const keys: KeyDef[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi += 1) {
    keys.push({
      midi,
      pitch: midiToPitch(midi),
      black: BLACK_SET.has(midi % 12)
    });
  }
  return keys;
};

export function PianoKeyboard({
  minPitch = "C1",
  maxPitch = "C7",
  selectedPitch,
  onSelectPitch
}: PianoKeyboardProps) {
  const keys = buildKeys(minPitch, maxPitch);
  const whiteKeys = keys.filter((key) => !key.black);
  const keybedWidth = whiteKeys.length * WHITE_KEY_WIDTH + Math.max(0, whiteKeys.length - 1) * WHITE_KEY_GAP;
  const blackKeys = keys
    .filter((key) => key.black)
    .map((key) => {
      const leftWhiteIndex = whiteKeys.findIndex((white) => white.midi === key.midi - 1);
      if (leftWhiteIndex === -1) return null;
      const boundaryCenterX = (leftWhiteIndex + 1) * (WHITE_KEY_WIDTH + WHITE_KEY_GAP) - WHITE_KEY_GAP * 0.5;
      const left = boundaryCenterX - BLACK_KEY_WIDTH / 2;
      return { ...key, left };
    })
    .filter((key): key is KeyDef & { left: number } => Boolean(key));

  return (
    <div className="piano-shell" role="group" aria-label="Piano keyboard">
      <div className="piano-keys-wrap" style={{ width: `${keybedWidth}px` }}>
        <div className="piano-white-row">
          {whiteKeys.map((key) => {
            const selected = key.pitch === selectedPitch;
            const qwerty = qwertyKeyForPitch(key.pitch);
            return (
              <button
                key={key.midi}
                type="button"
                className={selected ? "piano-key white selected" : "piano-key white"}
                onClick={() => onSelectPitch(key.pitch)}
              >
                <span className="pitch-label">{key.pitch}</span>
                {qwerty && <span className="qwerty-label">{qwerty}</span>}
              </button>
            );
          })}
        </div>

        <div className="piano-black-row" aria-hidden>
          {blackKeys.map((blackKey) => {
            const selected = blackKey.pitch === selectedPitch;
            const qwerty = qwertyKeyForPitch(blackKey.pitch);
            return (
              <button
                key={blackKey.midi}
                type="button"
                className={selected ? "piano-key black selected" : "piano-key black"}
                style={{ left: `${blackKey.left}px` }}
                onClick={() => onSelectPitch(blackKey.pitch)}
              >
                <span className="pitch-label">{blackKey.pitch}</span>
                {qwerty && <span className="qwerty-label">{qwerty}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
