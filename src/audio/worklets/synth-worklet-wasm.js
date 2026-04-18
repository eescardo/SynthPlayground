import { SynthWorkletProcessor, setRendererFactory } from "./synth-worklet-runtime.js";
import { createWasmRenderer } from "./synth-worklet-wasm-renderer.js";

setRendererFactory(createWasmRenderer);

registerProcessor("synth-worklet-processor", SynthWorkletProcessor);
