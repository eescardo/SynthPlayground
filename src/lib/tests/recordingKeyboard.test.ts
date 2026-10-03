import { describe, expect, it } from "vitest";
import { shouldStartRecordingKeyboardNote } from "@/lib/recordingKeyboard";

describe("shouldStartRecordingKeyboardNote", () => {
  const keyboardEvent = (overrides: Partial<Parameters<typeof shouldStartRecordingKeyboardNote>[0]> = {}) => ({
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    ...overrides
  });

  it("accepts unhandled plain and shifted pitch input", () => {
    expect(shouldStartRecordingKeyboardNote(keyboardEvent())).toBe(true);
  });

  it.each(["altKey", "ctrlKey", "metaKey"] as const)("rejects pitch-looking chords with %s", (modifier) => {
    expect(shouldStartRecordingKeyboardNote(keyboardEvent({ [modifier]: true }))).toBe(false);
  });

  it("rejects an event already claimed by another keyboard owner", () => {
    expect(shouldStartRecordingKeyboardNote(keyboardEvent({ defaultPrevented: true }))).toBe(false);
  });
});
