const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

export const pitchToMidi = (pitchStr: string): number => {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(pitchStr.trim());
  if (!match) {
    throw new Error(`Invalid pitch: ${pitchStr}`);
  }
  const [, noteName, octaveStr] = match;
  const semitone = NOTE_TO_SEMITONE[noteName];
  if (semitone === undefined) {
    throw new Error(`Unsupported note name: ${noteName}`);
  }
  const octave = Number.parseInt(octaveStr, 10);
  return (octave + 1) * 12 + semitone;
};

export const midiToVoct = (midi: number): number => (midi - 60) / 12;

export const pitchToVoct = (pitchStr: string): number => midiToVoct(pitchToMidi(pitchStr));

export const midiToPitch = (midi: number): string => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitone = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[semitone]}${octave}`;
};

const QWERTY_ORDER = "QWERTYUIOPASDFGHJKLZXCVBNM";
const QWERTY_START_MIDI = 48; // C3

export const QWERTY_PITCH_MAP: Record<string, string> = Object.fromEntries(
  QWERTY_ORDER.split("").map((char, index) => [char.toLowerCase(), midiToPitch(QWERTY_START_MIDI + index)])
);

export const keyToPitch = (key: string): string | undefined => QWERTY_PITCH_MAP[key.toLowerCase()];

export const qwertyKeyForPitch = (pitchStr: string): string | undefined => {
  for (const [key, pitch] of Object.entries(QWERTY_PITCH_MAP)) {
    if (pitch === pitchStr) {
      return key.toUpperCase();
    }
  }
  return undefined;
};
