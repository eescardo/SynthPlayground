# AUDIO_PIPELINE

This repo uses the Rust/WASM renderer as the only synthesis backend.

For the current audio pipeline notes, see:

- [src/audio/AUDIO_PIPELINE.md](/Users/eddy/code/SynthPlayground/src/audio/AUDIO_PIPELINE.md)

Short version:

- live playback runs through an AudioWorklet shell
- the worklet hosts the WASM renderer from `rust/dsp-core`
- offline export and benchmark paths use the same renderer abstraction
- there is no JavaScript synthesis fallback path
