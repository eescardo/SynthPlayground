import { describe, expect, it } from "vitest";

import { freezeProjectSnapshot } from "@/lib/projectImmutability";
import { createDefaultProject } from "@/lib/patch/presets";

describe("project immutability", () => {
  it("freezes committed project snapshots in non-production builds", () => {
    const project = freezeProjectSnapshot(createDefaultProject());

    expect(Object.isFrozen(project)).toBe(true);
    expect(Object.isFrozen(project.tracks)).toBe(true);
    expect(Object.isFrozen(project.tracks[0])).toBe(true);
    expect(Object.isFrozen(project.tracks[0]?.notes)).toBe(true);
    expect(Object.isFrozen(project.patches[0]?.nodes)).toBe(true);
    expect(() => {
      project.tracks[0]!.notes.push({
        id: "mutating_note",
        pitchStr: "C4",
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8
      });
    }).toThrow();
  });
});
