import { describe, expect, it } from "vitest";
import {
  beginRecordingStart,
  cancelRecordingStart,
  claimRecordingPlaybackStart,
  completeRecordingPlaybackStart,
  createRecordingStartGate
} from "@/lib/recordingStartGate";

describe("recording start gate", () => {
  it("marks a stale count-in playback start without taking ownership from a newer recording start", () => {
    const gate = createRecordingStartGate();

    const firstToken = beginRecordingStart(gate);
    expect(claimRecordingPlaybackStart(gate, firstToken)).toBe(true);

    const secondToken = beginRecordingStart(gate);
    expect(claimRecordingPlaybackStart(gate, secondToken)).toBe(true);

    expect(completeRecordingPlaybackStart(gate, firstToken)).toEqual({
      current: false,
      ownsPlaybackStart: false
    });
    expect(gate.playbackStartToken).toBe(secondToken);
    expect(completeRecordingPlaybackStart(gate, secondToken)).toEqual({
      current: true,
      ownsPlaybackStart: true
    });
  });

  it("does not launch the same count-in playback start twice", () => {
    const gate = createRecordingStartGate();
    const token = beginRecordingStart(gate);

    expect(claimRecordingPlaybackStart(gate, token)).toBe(true);
    expect(claimRecordingPlaybackStart(gate, token)).toBe(false);
  });

  it("lets a cancelled stale start clean up only while it still owns the in-flight playback start", () => {
    const gate = createRecordingStartGate();
    const token = beginRecordingStart(gate);
    expect(claimRecordingPlaybackStart(gate, token)).toBe(true);

    cancelRecordingStart(gate);

    expect(completeRecordingPlaybackStart(gate, token)).toEqual({
      current: false,
      ownsPlaybackStart: true
    });
  });
});
