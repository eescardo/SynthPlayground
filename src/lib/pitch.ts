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

// Pitch string format:
// - Note letter: A..G
// - Optional accidental: # or b
// - Signed octave integer
// Examples: C4, F#3, Bb2, C-1

/**
 * Converts a pitch string (for example "C4" or "F#3") to MIDI note number.
 * MIDI convention used here is C4 = 60.
 */
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

/**
 * Converts a MIDI note number back to pitch string using sharps for accidentals.
 * Example: 60 -> "C4", 61 -> "C#4".
 */
export const midiToPitch = (midi: number): string => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitone = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[semitone]}${octave}`;
};

const PHYSICAL_KEY_SEQUENCE = [
  "`",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "-",
  "=",
  "q",
  "w",
  "e",
  "r",
  "t",
  "y",
  "u",
  "i",
  "o",
  "p",
  "[",
  "]",
  "a",
  "s",
  "d",
  "f",
  "g",
  "h",
  "j",
  "k",
  "l",
  ";",
  "'",
  "z",
  "x",
  "c",
  "v",
  "b",
  "n",
  "m",
  ",",
  ".",
  "/"
] as const;

const SHIFTED_KEY_ALIASES: Record<string, string> = {
  "~": "`",
  "!": "1",
  "@": "2",
  "#": "3",
  "$": "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  "_": "-",
  "+": "=",
  "{": "[",
  "}": "]",
  ":": ";",
  "\"": "'",
  "<": ",",
  ">": ".",
  "?": "/"
};

const QWERTY_START_MIDI = 36; // C2

const qwertyEntries = PHYSICAL_KEY_SEQUENCE.map((key, index) => [key, midiToPitch(QWERTY_START_MIDI + index)] as const);

export const QWERTY_PITCH_MAP: Record<string, string> = Object.fromEntries(qwertyEntries);

export const keyToPitch = (key: string): string | undefined => {
  const normalized = SHIFTED_KEY_ALIASES[key] ?? key.toLowerCase();
  return QWERTY_PITCH_MAP[normalized];
};

export const qwertyKeyForPitch = (pitchStr: string): string | undefined => {
  for (const [key, pitch] of qwertyEntries) {
    if (pitch === pitchStr) {
      return key === "`" ? "~" : key.toUpperCase();
    }
  }
  return undefined;
};
