import { describe, expect, it, vi } from "vitest";
import { createSproutError, hydrateSerializableSproutError, reportSproutErrorToConsole } from "@/lib/sproutErrors";

describe("sproutErrors", () => {
  it("creates structured errors with required telemetry fields", () => {
    const cause = new Error("boom");
    const error = createSproutError({
      source: "audio_worklet",
      code: "runtime_error",
      severity: "error",
      message: "Audio worklet process_block failed: boom",
      error: cause,
      details: { phase: "process_block" }
    });

    expect(error).toEqual({
      source: "audio_worklet",
      code: "runtime_error",
      severity: "error",
      message: "Audio worklet process_block failed: boom",
      error: cause,
      details: { phase: "process_block" }
    });
  });

  it("hydrates remote worklet errors with the remote stack as the primary error and cause", () => {
    const remoteStack = "Error: boom\n    at processBlock (synth-worklet-runtime.js:123:4)";
    const error = hydrateSerializableSproutError({
      source: "audio_worklet",
      code: "runtime_error",
      severity: "error",
      message: "Audio worklet process_block failed: boom",
      details: { errorMessage: "boom", errorName: "Error", phase: "process_block", remoteStack }
    });

    expect(error.error).toEqual(expect.any(Error));
    expect(error.error?.name).toBe("RemoteWorkletError");
    expect(error.error?.message).toBe("Audio worklet process_block failed: boom");
    expect(error.error?.stack).toBe(remoteStack);
    expect(error.error?.cause).toEqual(expect.any(Error));
    expect((error.error?.cause as Error).message).toBe("boom");
    expect((error.error?.cause as Error).stack).toBe(remoteStack);
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
        expect.any(Error),
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
