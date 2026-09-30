import { describe, expect, it } from "vitest";
import { canHandleTrackControlKeyDown } from "./hardwareNavigationUtils";

type KeyEvent = Parameters<typeof canHandleTrackControlKeyDown>[0];
const controlTarget = (kind: "reorder-handle" | "header-overlays"): EventTarget =>
  ({ closest: (selector: string) => (selector.includes(`"${kind}"`) ? {} : null) }) as unknown as EventTarget;
const event = (overrides: Partial<KeyEvent> = {}): KeyEvent => ({
  target: controlTarget("reorder-handle"),
  key: "z",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides
});
const owners = ["navigation", "global-shortcut", "pitch-preview"] as const;

describe("track-control keyboard ownership", () => {
  it.each(["z", "Z", " ", "Enter", "Backspace", "Delete", "-", "=", "_", "+", "?", "ArrowLeft", "ArrowRight"])(
    "does not let shortcut owners claim plain %s from a reorder grip",
    (key) => {
      for (const owner of owners) {
        expect(canHandleTrackControlKeyDown(event({ key }), owner)).toBe(false);
      }
    }
  );

  it.each(["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"])(
    "leaves plain %s to the control and modified variants to navigation",
    (key) => {
      expect(canHandleTrackControlKeyDown(event({ key }), "navigation")).toBe(false);
      for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
        expect(canHandleTrackControlKeyDown(event({ key, [modifier]: true }), "navigation")).toBe(true);
      }
    }
  );

  it("allows Escape and primary-modifier edit shortcuts, but not Alt/Shift-only shortcuts", () => {
    expect(canHandleTrackControlKeyDown(event({ key: "Escape" }), "global-shortcut")).toBe(true);
    for (const key of ["z", "y", "c", "v", "Backspace"]) {
      expect(canHandleTrackControlKeyDown(event({ key, ctrlKey: true }), "global-shortcut")).toBe(true);
      expect(canHandleTrackControlKeyDown(event({ key, metaKey: true }), "global-shortcut")).toBe(true);
      expect(canHandleTrackControlKeyDown(event({ key, ctrlKey: true, altKey: true }), "global-shortcut")).toBe(true);
      expect(canHandleTrackControlKeyDown(event({ key, altKey: true }), "global-shortcut")).toBe(false);
      expect(canHandleTrackControlKeyDown(event({ key, shiftKey: true }), "global-shortcut")).toBe(false);
    }
  });

  it("preserves other track chrome's arrow navigation and existing shortcut eligibility", () => {
    const target = controlTarget("header-overlays");
    expect(canHandleTrackControlKeyDown(event({ target, key: "ArrowDown" }), "navigation")).toBe(true);
    expect(canHandleTrackControlKeyDown(event({ target, key: "z" }), "navigation")).toBe(false);
    expect(canHandleTrackControlKeyDown(event({ target, key: "Backspace" }), "global-shortcut")).toBe(true);
    expect(canHandleTrackControlKeyDown(event({ target, key: "-" }), "pitch-preview")).toBe(true);
  });

  it("leaves non-track targets to each handler's normal rules", () => {
    for (const owner of owners) {
      expect(canHandleTrackControlKeyDown(event({ target: null }), owner)).toBe(true);
      expect(canHandleTrackControlKeyDown(event({ target: new EventTarget() }), owner)).toBe(true);
    }
  });
});
