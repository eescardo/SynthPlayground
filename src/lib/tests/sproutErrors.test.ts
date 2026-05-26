import { describe, expect, it, vi } from "vitest";
import { createSproutError, normalizeSproutError, reportSproutErrorToConsole } from "@/lib/sproutErrors";

describe("sproutErrors", () => {
  it("normalizes legacy string messages into structured errors", () => {
    expect(normalizeSproutError("Something failed", "legacy_ui")).toEqual({
      source: "legacy_ui",
      severity: "error",
      message: "Something failed",
      error: "Something failed",
      phase: undefined,
      details: undefined
    });
  });

  it("keeps structured errors intact", () => {
    const error = createSproutError({
      source: "audio_worklet",
      severity: "error",
      message: "Audio worklet process_block failed: boom",
      error: "boom",
      phase: "process_block"
    });

    expect(normalizeSproutError(error)).toBe(error);
  });

  it("reports severity through the matching console method", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      reportSproutErrorToConsole(
        createSproutError({
          source: "audio_worklet",
          severity: "error",
          message: "Audio failed",
          error: "boom",
          phase: "process_block"
        })
      );
      reportSproutErrorToConsole(
        createSproutError({
          source: "autosave",
          severity: "warning",
          message: "Autosave skipped",
          error: "quota",
          phase: "save"
        })
      );

      expect(consoleError).toHaveBeenCalledWith(
        "Audio failed",
        expect.objectContaining({
          source: "audio_worklet",
          phase: "process_block",
          error: "boom",
          severity: "error"
        })
      );
      expect(consoleWarn).toHaveBeenCalledWith(
        "Autosave skipped",
        expect.objectContaining({
          source: "autosave",
          phase: "save",
          error: "quota",
          severity: "warning"
        })
      );
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });
});
