export interface ReleaseNoteEntry {
  version: string;
  title: string;
  date: string;
  summary: string;
  changes: string[];
}

export const releaseNotes: ReleaseNoteEntry[] = [
  {
    version: "0.1.0",
    title: "Initial playground release",
    date: "2026-05-26",
    summary:
      "Initial version of the SynthSprout playground, with a basic composer and patch workspace for browser-based synth sketching.",
    changes: [
      "Basic composer UI for arranging ideas in the browser.",
      "Patch workspace UI for building and editing synth patches.",
      "Standard synth modules for oscillators, filters, envelopes, modulation, mixing, and effects."
    ]
  }
];
