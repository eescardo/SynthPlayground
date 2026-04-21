export type AudioRendererMode = "wasm" | "js";

// We default to the WASM renderer everywhere unless a dev session explicitly
// opts into the legacy JS backend. This keeps product and tooling behavior
// aligned with the intended long-term runtime, while still preserving a
// convenient escape hatch for debugging and parity work.
export const getAudioRendererMode = (): AudioRendererMode =>
  process.env.NEXT_PUBLIC_AUDIO_RENDERER === "js" ? "js" : "wasm";

export const isWasmAudioRendererMode = (): boolean => getAudioRendererMode() === "wasm";
