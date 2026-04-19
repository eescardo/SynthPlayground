import { afterEach, describe, expect, it } from "vitest";
import { getAudioRendererMode, isWasmAudioRendererMode } from "@/audio/renderers/shared/audioRendererMode";

const ORIGINAL_AUDIO_RENDERER = process.env.NEXT_PUBLIC_AUDIO_RENDERER;

afterEach(() => {
  if (ORIGINAL_AUDIO_RENDERER === undefined) {
    delete process.env.NEXT_PUBLIC_AUDIO_RENDERER;
    return;
  }
  process.env.NEXT_PUBLIC_AUDIO_RENDERER = ORIGINAL_AUDIO_RENDERER;
});

describe("audioRendererMode", () => {
  it("defaults to wasm when no explicit renderer mode is set", () => {
    delete process.env.NEXT_PUBLIC_AUDIO_RENDERER;

    expect(getAudioRendererMode()).toBe("wasm");
    expect(isWasmAudioRendererMode()).toBe(true);
  });

  it("switches to js when the explicit dev override is set", () => {
    process.env.NEXT_PUBLIC_AUDIO_RENDERER = "js";

    expect(getAudioRendererMode()).toBe("js");
    expect(isWasmAudioRendererMode()).toBe(false);
  });
});
