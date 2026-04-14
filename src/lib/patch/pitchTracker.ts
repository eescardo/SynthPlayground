import { NoteClipboardPayload } from "@/lib/clipboard";
import { midiToPitch, pitchToMidi } from "@/lib/pitch";
import { PreviewProbeCapture } from "@/types/probes";

export interface DetectedPitchNote {
  pitchStr: string;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  confidence: number;
}

export interface DominantSamplePitch {
  pitchStr: string;
  noteCount: number;
  totalDurationSeconds: number;
  confidence: number;
  suggestedPitchSemis: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function detectMonophonicPitchNotes(
  capture: PreviewProbeCapture | undefined,
  tempo: number
): DetectedPitchNote[] {
  return detectMonophonicPitchNotesFromSamples(capture?.samples, capture?.sampleRate, tempo);
}

export function detectMonophonicPitchNotesFromSamples(
  samplesInput: ArrayLike<number> | undefined,
  sampleRate: number | undefined,
  tempo: number
): DetectedPitchNote[] {
  if (!samplesInput || !samplesInput.length || !sampleRate || sampleRate <= 0 || tempo <= 0) {
    return [];
  }

  const samples = Float32Array.from(samplesInput);
  const envelope = buildEnvelope(samples, sampleRate);
  const peakEnvelope = envelope.reduce((peak, value) => Math.max(peak, value), 0);
  if (peakEnvelope <= 0.0005) {
    return [];
  }

  const onsetThreshold = Math.max(0.01, peakEnvelope * 0.22);
  const releaseThreshold = onsetThreshold * 0.55;
  const minNoteSamples = Math.max(256, Math.floor(sampleRate * 0.04));
  const segments = detectEnvelopeSegments(envelope, onsetThreshold, releaseThreshold, minNoteSamples);
  const notes: DetectedPitchNote[] = [];
  const beatsPerSecond = tempo / 60;

  for (const segment of segments) {
    const windows = analyzePitchWindows(samples, sampleRate, segment.startSample, segment.endSample);
    if (windows.length === 0) {
      continue;
    }

    let current = windows[0];
    for (let index = 1; index <= windows.length; index += 1) {
      const next = windows[index];
      const shouldSplit =
        !next ||
        Math.abs(next.midi - current.midi) >= 1 ||
        next.startSample - current.endSample > Math.floor(sampleRate * 0.03);

      if (!shouldSplit) {
        current = {
          midi: Math.round((current.midi + next.midi) / 2),
          startSample: current.startSample,
          endSample: next.endSample,
          confidence: Math.max(current.confidence, next.confidence)
        };
        continue;
      }

      const durationSamples = current.endSample - current.startSample;
      if (durationSamples >= minNoteSamples) {
        notes.push({
          pitchStr: midiToPitch(current.midi),
          startBeat: (current.startSample / sampleRate) * beatsPerSecond,
          durationBeats: (durationSamples / sampleRate) * beatsPerSecond,
          velocity: 1,
          confidence: current.confidence
        });
      }
      if (next) {
        current = next;
      }
    }
  }

  return mergeAdjacentEqualPitch(notes);
}

export function detectDominantSamplePitches(
  samplesInput: ArrayLike<number> | undefined,
  sampleRate: number | undefined,
  limit = 6
): DominantSamplePitch[] {
  const detectedNotes = detectMonophonicPitchNotesFromSamples(samplesInput, sampleRate, 60);
  if (detectedNotes.length === 0) {
    return [];
  }

  const aggregate = new Map<string, DominantSamplePitch>();
  for (const note of detectedNotes) {
    const existing = aggregate.get(note.pitchStr);
    const totalDurationSeconds = note.durationBeats;
    if (existing) {
      existing.noteCount += 1;
      existing.totalDurationSeconds += totalDurationSeconds;
      existing.confidence = Math.max(existing.confidence, note.confidence);
      continue;
    }
    aggregate.set(note.pitchStr, {
      pitchStr: note.pitchStr,
      noteCount: 1,
      totalDurationSeconds,
      confidence: note.confidence,
      suggestedPitchSemis: clamp(60 - pitchToMidi(note.pitchStr), -48, 48)
    });
  }

  return [...aggregate.values()]
    .sort((left, right) => {
      if (right.totalDurationSeconds !== left.totalDurationSeconds) {
        return right.totalDurationSeconds - left.totalDurationSeconds;
      }
      if (right.noteCount !== left.noteCount) {
        return right.noteCount - left.noteCount;
      }
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }
      return pitchToMidi(left.pitchStr) - pitchToMidi(right.pitchStr);
    })
    .slice(0, Math.max(1, limit));
}

export function buildPitchTrackerClipboardPayload(
  patchId: string,
  notes: DetectedPitchNote[]
): NoteClipboardPayload | null {
  if (notes.length === 0) {
    return null;
  }
  const beatSpan = notes.reduce((max, note) => Math.max(max, note.startBeat + note.durationBeats), 0);
  return {
    type: "synth-playground/note-selection",
    version: 1,
    beatSpan,
    tracks: [
      {
        sourcePatchId: patchId,
        notes: notes.map((note) => ({
          pitchStr: note.pitchStr,
          startBeat: note.startBeat,
          durationBeats: note.durationBeats,
          velocity: note.velocity
        })),
        automationLanes: []
      }
    ]
  };
}

function buildEnvelope(samples: Float32Array, sampleRate: number) {
  const attack = Math.exp(-1 / Math.max(1, sampleRate * 0.0025));
  const release = Math.exp(-1 / Math.max(1, sampleRate * 0.015));
  const envelope = new Float32Array(samples.length);
  let state = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const magnitude = Math.abs(samples[index]);
    const alpha = magnitude > state ? attack : release;
    state = state * alpha + magnitude * (1 - alpha);
    envelope[index] = state;
  }
  return envelope;
}

function detectEnvelopeSegments(
  envelope: Float32Array,
  onsetThreshold: number,
  releaseThreshold: number,
  minNoteSamples: number
) {
  const segments: Array<{ startSample: number; endSample: number }> = [];
  let startSample = -1;
  for (let index = 0; index < envelope.length; index += 1) {
    const value = envelope[index];
    if (startSample < 0) {
      if (value >= onsetThreshold) {
        startSample = index;
      }
      continue;
    }
    if (value <= releaseThreshold) {
      if (index - startSample >= minNoteSamples) {
        segments.push({ startSample, endSample: index });
      }
      startSample = -1;
    }
  }
  if (startSample >= 0 && envelope.length - startSample >= minNoteSamples) {
    segments.push({ startSample, endSample: envelope.length });
  }
  return segments;
}

function analyzePitchWindows(
  samples: Float32Array,
  sampleRate: number,
  startSample: number,
  endSample: number
) {
  const windowSize = Math.max(512, Math.min(2048, endSample - startSample));
  const hopSize = Math.max(128, Math.floor(windowSize / 4));
  const windows: Array<{ midi: number; startSample: number; endSample: number; confidence: number }> = [];
  for (let windowStart = startSample; windowStart + windowSize <= endSample; windowStart += hopSize) {
    const frequency = detectAutocorrelationFrequency(samples, sampleRate, windowStart, windowSize);
    if (!frequency) {
      continue;
    }
    const midi = Math.round(69 + 12 * Math.log2(frequency.frequency / 440));
    windows.push({
      midi: clamp(midi, 24, 108),
      startSample: windowStart,
      endSample: windowStart + windowSize,
      confidence: frequency.confidence
    });
  }
  return windows;
}

function detectAutocorrelationFrequency(
  samples: Float32Array,
  sampleRate: number,
  startSample: number,
  windowSize: number
) {
  const minFrequency = 55;
  const maxFrequency = 1760;
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(windowSize - 2, Math.floor(sampleRate / minFrequency));

  let rms = 0;
  for (let index = 0; index < windowSize; index += 1) {
    const sample = samples[startSample + index] ?? 0;
    rms += sample * sample;
  }
  rms = Math.sqrt(rms / Math.max(1, windowSize));
  if (rms < 0.003) {
    return null;
  }

  let bestLag = -1;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let index = 0; index < windowSize - lag; index += 1) {
      correlation += samples[startSample + index] * samples[startSample + index + lag];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorrelation <= 0) {
    return null;
  }

  return {
    frequency: sampleRate / bestLag,
    confidence: clamp(bestCorrelation / Math.max(1, windowSize), 0, 1)
  };
}

function mergeAdjacentEqualPitch(notes: DetectedPitchNote[]) {
  if (notes.length <= 1) {
    return notes;
  }
  const merged = [notes[0]];
  for (let index = 1; index < notes.length; index += 1) {
    const previous = merged[merged.length - 1];
    const note = notes[index];
    const previousEnd = previous.startBeat + previous.durationBeats;
    if (previous.pitchStr === note.pitchStr && note.startBeat - previousEnd <= 0.05) {
      previous.durationBeats = note.startBeat + note.durationBeats - previous.startBeat;
      previous.confidence = Math.max(previous.confidence, note.confidence);
      continue;
    }
    merged.push({ ...note });
  }
  return merged;
}
