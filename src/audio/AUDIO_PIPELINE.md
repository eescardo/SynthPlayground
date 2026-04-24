# Audio Pipeline

This repo now uses the Rust/WASM renderer as the only synthesis backend.

The main split is:

- `src/audio/renderers/wasm/`
  - the renderer and planning code for the WASM backend
- `src/audio/worklets/`
  - the live AudioWorklet shell and browser-facing WASM renderer glue
- `src/audio/offline/`
  - offline host loops used by export, benchmarks, and profiling
- `rust/dsp-core/`
  - the DSP engine itself

## Renderer Model

The renderer abstraction is defined in:

- [renderers/shared/synth-renderer.d.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/shared/synth-renderer.d.ts)

Important pieces:

- `SynthRenderer`
  - long-lived backend instance with sample rate, block size, and default project
- `SynthRenderStream`
  - one transport or preview session created from a renderer
- planner
  - lowers a project and its events into the numeric/layout form the runtime executes

The planner for the WASM backend lives in:

- [renderers/wasm/wasmSubsetCompiler.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/wasmSubsetCompiler.ts)
- [renderers/wasm/synth-worklet-wasm-compiler-core.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/synth-worklet-wasm-compiler-core.js)

What the planner does:

- orders nodes for execution
- resolves wiring into concrete signal indices
- lowers events into the WASM event schema
- prepares the compact numeric project spec the Rust engine consumes

The planner does not render audio. It decides the execution layout so the renderer can run cheaply.

## Project Immutability

Project snapshots are immutable once they enter app state. Composer and patch-workspace edits must return replacement
`Project` objects, replacement `tracks`/`patches` arrays, and replacement edited child objects instead of mutating the
current snapshot in place.

This is part of the audio correctness contract, not just a React style preference:

- the WASM renderer caches planned project specs by project object identity
- the event compiler caches track, patch, and macro lookup tables for the planned project
- same-reference mutation could reuse stale planning data for a changed patch or track

The app enforces this in non-production builds by deep-freezing committed project snapshots from
[projectImmutability.ts](/Users/eddy/code/SynthPlayground/src/lib/projectImmutability.ts). If a future editor path
tries to mutate the current project snapshot in place, it should throw during local development/tests instead of
silently poisoning renderer caches.

## Live Mode

Live playback runs through:

- [engineBackends.ts](/Users/eddy/code/SynthPlayground/src/audio/engineBackends.ts)
- [worklets/createInitializedWorkletNode.ts](/Users/eddy/code/SynthPlayground/src/audio/worklets/createInitializedWorkletNode.ts)
- [worklets/synth-worklet.js](/Users/eddy/code/SynthPlayground/src/audio/worklets/synth-worklet.js)
- [worklets/synth-worklet-runtime.js](/Users/eddy/code/SynthPlayground/src/audio/worklets/synth-worklet-runtime.js)
- [worklets/synth-worklet-wasm-renderer.js](/Users/eddy/code/SynthPlayground/src/audio/worklets/synth-worklet-wasm-renderer.js)

Flow:

1. the main thread loads the AudioWorklet module
2. it fetches the compiled `.wasm` bytes
3. it sends an `INIT` message with `wasmBytes`
4. the worklet creates a WASM renderer and starts transport or preview streams
5. each worklet callback asks the active stream to render the next block

The app performs SIMD compatibility detection before booting the renderer. If the browser is missing required features, it shows the browser compatibility modal instead of trying to start audio.

Expected browser floor for the default renderer:

- Chrome/Edge 91+
- Firefox 89+
- Safari 16.4+

## Offline Mode

Offline rendering reuses the same renderer abstraction, but drives it from normal TS loops instead of an AudioWorklet.

Files:

- [offline/renderOfflineWithRenderer.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderOfflineWithRenderer.ts)
- [offline/renderProjectOffline.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderProjectOffline.ts)
- [offline/renderProjectOfflineBrowserWasm.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderProjectOfflineBrowserWasm.ts)

Usage:

- browser export from the app
- Node-based benchmarks
- profiling runs

Current split:

- browser export uses `renderProjectOfflineBrowserWasm(...)`
- Node/tooling offline rendering uses `renderProjectOffline(...)`

Both are WASM-backed. The difference is just the host-specific loader:

- browser path loads the wasm binary through `fetch(...)`
- Node path loads the wasm module through the Node-side loader in [renderers/wasm/loadNodeDspWasm.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/loadNodeDspWasm.ts)

## Worklet Publishing

Worklet/runtime files are copied into:

- `public/worklets/`

The publishing step is:

- [scripts/worklets/sync-worklet-runtime.mjs](/Users/eddy/code/SynthPlayground/scripts/worklets/sync-worklet-runtime.mjs)

It scans:

- `src/audio/worklets`
- `src/audio/renderers/shared`
- `src/audio/renderers/wasm`

and rewrites relative imports into the flat `public/worklets` directory used by the browser runtime.

## Benchmarking

The benchmark suite is now WASM-only and compares:

- baseline ref vs head ref

Main files:

- [benchmarks/runBenchmark.ts](/Users/eddy/code/SynthPlayground/src/audio/benchmarks/runBenchmark.ts)
- [scripts/audio-benchmarks/run.ts](/Users/eddy/code/SynthPlayground/scripts/audio-benchmarks/run.ts)
- [scripts/audio-benchmarks/profile-audio.ts](/Users/eddy/code/SynthPlayground/scripts/audio-benchmarks/profile-audio.ts)

Local commands:

- main benchmark suite:
  - `pnpm run benchmark:audio -- --runs 2 --output artifacts/audio-benchmarks/local.json`
- compare benchmark JSON outputs:
  - `pnpm run benchmark:audio:compare -- --base artifacts/audio-benchmarks/base.json --head artifacts/audio-benchmarks/head.json`
- CPU profile one scenario:
  - `pnpm run profile:audio -- --scenario-id stress-3min-35tracks --label wasm-stress`

## PR Benchmarks

Workflow:

- [pr-audio-benchmarks.yml](/Users/eddy/code/SynthPlayground/.github/workflows/pr-audio-benchmarks.yml)

Trigger labels:

- `audio-benchmarks`
- `audio-benchmarks:runs:x`

The workflow:

- benchmarks the PR base ref
- benchmarks the PR head ref
- compares the two WASM benchmark bundles
- posts a sticky PR comment with the delta table

## Good Debug Order

When something sounds wrong or seems slow:

1. confirm whether the issue is live-only or offline too
2. inspect the planned project/event shape if the problem looks structural
3. run `benchmark:audio` on a representative scenario
4. run `profile:audio` if it looks performance-related
5. if needed, inspect the Rust engine in [rust/dsp-core/src/](/Users/eddy/code/SynthPlayground/rust/dsp-core/src/)
