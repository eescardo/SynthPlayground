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

const CHROMATIC_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MICROTONAL_STEPS_PER_SEMITONE = 4;
const MICROTONAL_STEP_CENTS = 25;
const PITCH_PATTERN = /^([A-G](?:#|b)?)(-?\d+)(?:([+-])(\d+))?$/;

// Pitch string format:
// - Note letter: A..G
// - Optional accidental: # or b
// - Signed octave integer
// Examples: C4, F#3, Bb2, C-1

/**
 * Converts a pitch string (for example "C4", "F#3", or "C4+25") to MIDI note number.
 * MIDI convention used here is C4 = 60.
 */
export const pitchToMidi = (pitchStr: string): number => {
  const match = PITCH_PATTERN.exec(pitchStr.trim());
  if (!match) {
    throw new Error(`Invalid pitch: ${pitchStr}`);
  }
  const [, noteName, octaveStr, centsSign, centsText] = match;
  const semitone = NOTE_TO_SEMITONE[noteName];
  if (semitone === undefined) {
    throw new Error(`Unsupported note name: ${noteName}`);
  }
  const octave = Number.parseInt(octaveStr, 10);
  const cents = centsText ? Number.parseInt(centsText, 10) : 0;
  if (cents % MICROTONAL_STEP_CENTS !== 0 || cents < 0 || cents >= 100) {
    throw new Error(`Unsupported microtonal offset: ${pitchStr}`);
  }
  const centsOffset = centsSign === "-" ? -cents : cents;
  return (octave + 1) * 12 + semitone + centsOffset / 100;
};

export const midiToVoct = (midi: number): number => (midi - 60) / 12;

export const pitchToVoct = (pitchStr: string): number => midiToVoct(pitchToMidi(pitchStr));

/**
 * Converts a MIDI note number back to pitch string using sharps for accidentals.
 * Microtonal values are normalized to 25-cent steps.
 * Examples: 60 -> "C4", 60.25 -> "C4+25", 61 -> "C#4".
 */
export const midiToPitch = (midi: number): string => {
  const microtonalSteps = Math.round(midi * MICROTONAL_STEPS_PER_SEMITONE);
  const semitone = Math.floor(microtonalSteps / MICROTONAL_STEPS_PER_SEMITONE);
  const noteIndex = ((semitone % 12) + 12) % 12;
  const octave = Math.floor(semitone / 12) - 1;
  const cents = ((microtonalSteps % MICROTONAL_STEPS_PER_SEMITONE) + MICROTONAL_STEPS_PER_SEMITONE) % MICROTONAL_STEPS_PER_SEMITONE;
  const centsSuffix = cents === 0 ? "" : `+${cents * MICROTONAL_STEP_CENTS}`;
  return `${CHROMATIC_NOTE_NAMES[noteIndex]}${octave}${centsSuffix}`;
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
  "a",
  "s",
  "d",
  "f",
  "g",
  "h",
  "j",
  "k",
  "l",
  "z",
  "x",
  "c",
  "v",
  "b",
  "n",
  "m"
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

const QWERTY_START_MIDI = pitchToMidi("F2");

const qwertyEntries = PHYSICAL_KEY_SEQUENCE.map((key, index) => [key, midiToPitch(QWERTY_START_MIDI + index)] as const);

export const QWERTY_PITCH_MAP: Record<string, string> = Object.fromEntries(qwertyEntries);

export const normalizePhysicalPitchKey = (key: string): string | undefined => {
  const normalized = SHIFTED_KEY_ALIASES[key] ?? key.toLowerCase();
  return normalized in QWERTY_PITCH_MAP ? normalized : undefined;
};

export const keyToPitch = (key: string): string | undefined => {
  const normalized = normalizePhysicalPitchKey(key);
  return normalized ? QWERTY_PITCH_MAP[normalized] : undefined;
};

export const transposePitch = (pitchStr: string, semitoneDelta: number, options?: { minPitch?: string; maxPitch?: string }): string => {
  const minMidi = pitchToMidi(options?.minPitch ?? "C1");
  const maxMidi = pitchToMidi(options?.maxPitch ?? "C7");
  const nextMidi = Math.max(minMidi, Math.min(maxMidi, pitchToMidi(pitchStr) + semitoneDelta));
  return midiToPitch(nextMidi);
};

export const qwertyKeyForPitch = (pitchStr: string): string | undefined => {
  for (const [key, pitch] of qwertyEntries) {
    if (pitch === pitchStr) {
      return key === "`" ? "`" : key.toUpperCase();
    }
  }
  return undefined;
};
