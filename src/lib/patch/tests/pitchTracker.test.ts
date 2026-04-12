import { describe, expect, it } from "vitest";
import { buildPitchTrackerClipboardPayload, detectMonophonicPitchNotes } from "@/lib/patch/pitchTracker";
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
