import { describe, expect, it, vi } from "vitest";
import { createSproutError, normalizeSproutError, reportSproutErrorToConsole } from "@/lib/sproutErrors";

describe("sproutErrors", () => {
  it("normalizes legacy string messages into structured errors", () => {
    const normalized = normalizeSproutError("Something failed", "legacy_ui");

    expect(normalized).toEqual({
      source: "legacy_ui",
      code: "runtime_error",
      severity: "error",
      message: "Something failed",
      error: expect.any(Error),
      details: undefined
    });
    expect(normalized?.error?.message).toBe("Something failed");
  });

  it("keeps structured errors intact", () => {
    const error = createSproutError({
      source: "audio_worklet",
      code: "runtime_error",
      severity: "error",
      message: "Audio worklet process_block failed: boom",
      error: new Error("boom"),
      details: { phase: "process_block" }
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
          code: "runtime_error",
          severity: "error",
          message: "Audio failed",
          error: new Error("boom"),
          details: { phase: "process_block" }
        })
      );
      reportSproutErrorToConsole(
        createSproutError({
          source: "autosave",
          code: "save_failed",
          severity: "warning",
          message: "Autosave skipped",
          error: new Error("quota"),
          details: { phase: "save" }
        })
      );

      expect(consoleError).toHaveBeenCalledWith(
        "Audio failed",
        expect.any(Error),
        expect.objectContaining({
          source: "audio_worklet",
          code: "runtime_error",
          severity: "error"
        })
      );
      expect(consoleWarn).toHaveBeenCalledWith(
        "Autosave skipped",
        expect.objectContaining({
          source: "autosave",
          code: "save_failed",
          severity: "warning"
        })
      );
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });
});
