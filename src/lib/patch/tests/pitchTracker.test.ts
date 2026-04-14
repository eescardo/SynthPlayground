import { describe, expect, it } from "vitest";
import {
  buildPitchTrackerClipboardPayload,
  detectDominantSamplePitches,
  detectMonophonicPitchNotes,
  detectMonophonicPitchNotesFromSamples
} from "@/lib/patch/pitchTracker";
import { PreviewProbeCapture } from "@/types/probes";

function buildSineCapture(frequencies: Array<{ hz: number; seconds: number }>, sampleRate = 48000): PreviewProbeCapture {
  const silenceSeconds = 0.03;
  const samples: number[] = [];
  for (const segment of frequencies) {
    const sampleCount = Math.floor(segment.seconds * sampleRate);
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(Math.sin((2 * Math.PI * segment.hz * index) / sampleRate) * 0.6);
    }
    const silenceCount = Math.floor(silenceSeconds * sampleRate);
    for (let index = 0; index < silenceCount; index += 1) {
      samples.push(0);
    }
  }
  return {
    probeId: "probe_pitch",
    kind: "pitch_tracker",
    target: { kind: "connection", connectionId: "conn_1" },
    sampleRate,
    durationSamples: samples.length,
    capturedSamples: samples.length,
    samples
  };
}

describe("pitch tracker", () => {
  it("detects simple monophonic sine-note segments", () => {
    const capture = buildSineCapture([
      { hz: 261.63, seconds: 0.25 },
      { hz: 329.63, seconds: 0.22 }
    ]);

    const notes = detectMonophonicPitchNotes(capture, 120);

    expect(notes).toHaveLength(2);
    expect(notes[0]?.pitchStr).toBe("C4");
    expect(notes[1]?.pitchStr).toBe("E4");
    expect(notes[0]?.durationBeats).toBeGreaterThan(0.4);
  });

  it("detects notes directly from sample data", () => {
    const capture = buildSineCapture([
      { hz: 220, seconds: 0.28 },
      { hz: 261.63, seconds: 0.25 }
    ]);

    const notes = detectMonophonicPitchNotesFromSamples(capture.samples, capture.sampleRate, 120);

    expect(notes[0]?.pitchStr).toBe("A3");
    expect(notes.at(-1)?.pitchStr).toBe("C4");
    expect(notes.some((note) => note.pitchStr === "A3")).toBe(true);
    expect(notes.some((note) => note.pitchStr === "C4")).toBe(true);
  });

  it("summarizes dominant pitches for a trimmed sample region", () => {
    const capture = buildSineCapture([
      { hz: 220, seconds: 0.36 },
      { hz: 220, seconds: 0.2 },
      { hz: 261.63, seconds: 0.14 }
    ]);

    const summary = detectDominantSamplePitches(capture.samples, capture.sampleRate);

    expect(summary[0]).toMatchObject({
      pitchStr: "A3",
      noteCount: 2,
      suggestedPitchSemis: 3
    });
    expect(summary[0]?.totalDurationSeconds).toBeGreaterThan(summary[1]?.totalDurationSeconds ?? 0);
  });

  it("builds a note clipboard payload from detected notes", () => {
    const payload = buildPitchTrackerClipboardPayload("patch_1", [
      { pitchStr: "C4", startBeat: 0, durationBeats: 0.5, velocity: 1, confidence: 0.8 }
    ]);

    expect(payload).toEqual({
      type: "synth-playground/note-selection",
      version: 1,
      beatSpan: 0.5,
      tracks: [
        {
          sourcePatchId: "patch_1",
          notes: [{ pitchStr: "C4", startBeat: 0, durationBeats: 0.5, velocity: 1 }],
          automationLanes: []
        }
      ]
    });
  });
});
