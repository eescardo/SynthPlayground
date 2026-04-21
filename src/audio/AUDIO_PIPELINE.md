# Audio Pipeline

This directory contains the audio runtime used by live playback, offline export, benchmarks, and JS-vs-WASM parity checks.

## High-level Model

The audio system is split into a few layers:

- `renderers/`
  - reusable backend implementations
  - JS and WASM variants both implement the same renderer/stream contract
- `worklets/`
  - live AudioWorklet host code for browser playback and preview
  - owns transport/preview message handling and AudioWorklet registration
- `offline/`
  - host loop for export and benchmark rendering outside the AudioWorklet
- `scheduler.ts`
  - converts notes/automation/project timeline state into scheduled events
- `benchmarks/`
  - benchmark scenario definitions and benchmark runner glue

The key abstraction is:

- `SynthRenderer`
  - configured once for a backend/runtime environment
  - starts render sessions
- `SynthRenderStream`
  - one render session / stream
  - consumes scheduled events
  - renders output block by block

## Renderer Variants

### JS Renderer

Files:

- [renderers/js/synth-renderer-js.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/js/synth-renderer-js.js)
- [renderers/js/synth-worklet-node-processors.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/js/synth-worklet-node-processors.js)
- [renderers/js/synth-worklet-constants.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/js/synth-worklet-constants.js)
- [renderers/js/synth-worklet-math.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/js/synth-worklet-math.js)

The JS renderer keeps its runtime entirely in JavaScript:

- the patch is planned into ordered runtime nodes and indexed signal buffers
- each track owns voice state, node state, param smoothing state, and FX state
- node processors run directly over typed arrays in JS

### WASM Renderer

Files:

- [renderers/wasm/wasmSynthRenderer.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/wasmSynthRenderer.ts)
- [renderers/wasm/wasmSubsetCompiler.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/wasmSubsetCompiler.ts)
- [renderers/wasm/synth-worklet-wasm-compiler-core.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/synth-worklet-wasm-compiler-core.js)
- [renderers/wasm/synth-worklet-wasm-renderer-core.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/synth-worklet-wasm-renderer-core.js)
- [rust/dsp-core/src/](/Users/eddy/code/SynthPlayground/rust/dsp-core/src/)

The WASM renderer separates planning from execution more explicitly:

- TypeScript plans the project/events into a smaller numeric WASM spec
- Rust owns the live render state and DSP execution
- the JS/WASM bridge mostly pushes planned project/event JSON in and reads block output back out

## Planning Step

In earlier conversations we called this a "compiler," but "planner" is usually the better intuition.

Planning decides:

- node execution order
- numeric signal indices / addressing
- input-to-output wiring resolution
- initial parameter layout and macro expansion
- event lowering into the backend-specific event schema

Planning does **not** do any of the following:

- render audio samples
- allocate long-lived audio output buffers for the whole song
- maintain live envelope/filter/delay state
- run DSP math for each frame

### JS planning

The JS planner is embedded in:

- [TrackRuntime.compilePatch()](/Users/eddy/code/SynthPlayground/src/audio/renderers/js/synth-renderer-js.js)

It lowers the patch directly into JS runtime structures.

### WASM planning

The WASM planner lives in:

- [renderers/wasm/wasmSubsetCompiler.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/wasmSubsetCompiler.ts)
- [renderers/wasm/synth-worklet-wasm-compiler-core.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/synth-worklet-wasm-compiler-core.js)

It lowers the project into a simpler spec that Rust can deserialize and execute efficiently.

## Live Mode vs Offline Mode

### Live mode

Live playback happens through the AudioWorklet host layer:

- [worklets/synth-worklet-runtime.js](/Users/eddy/code/SynthPlayground/src/audio/worklets/synth-worklet-runtime.js)
- [worklets/synth-worklet-wasm.js](/Users/eddy/code/SynthPlayground/src/audio/worklets/synth-worklet-wasm.js)
- [engineBackends.ts](/Users/eddy/code/SynthPlayground/src/audio/engineBackends.ts)

Responsibilities in live mode:

- receive transport / preview / macro / recording messages from the main thread
- start or replace `SynthRenderStream` sessions
- ask the current stream to render each AudioWorklet block
- handle preview capture plumbing and WASM worklet initialization

There are two live variants:

- default live path: WASM renderer behind the same shell
- explicit JS dev path: JS renderer behind the same shell, enabled by `NEXT_PUBLIC_AUDIO_RENDERER=js`

The default WASM build is compiled for WebAssembly SIMD and expects a modern browser profile:

- Chrome/Edge 91+
- Firefox 89+
- Safari 16.4+

At app load, WASM mode performs feature detection before initializing the audio path. If SIMD is unavailable, the app shows a compatibility modal instead of attempting to boot the renderer.

### Offline mode

Offline mode reuses the same renderer abstraction, but drives the stream in a normal Node/TS loop instead of through an AudioWorklet.

Files:

- [offline/renderOfflineWithRenderer.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderOfflineWithRenderer.ts)
- [offline/renderProjectOffline.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderProjectOffline.ts)
- [offline/renderProjectOfflineWasm.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderProjectOfflineWasm.ts)
- [offline/renderProjectOfflineBrowserWasm.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderProjectOfflineBrowserWasm.ts)

Offline mode is used for:

- export path from the app
- local benchmarks
- JS-vs-WASM parity checks
- profiling runs

The important detail is that offline rendering is now backend-agnostic at the host loop layer:

- the loop only knows about `SynthRenderer` and `SynthRenderStream`
- JS and WASM differ only in which renderer gets constructed
- `renderProjectOffline(...)` defaults to the Node-side WASM renderer for tooling and benchmarks
- `renderProjectOfflineJs(...)` is the explicit legacy JS fallback for parity checks and targeted tests
- browser export uses a browser-safe WASM helper instead of the Node-side loader

## Worklet Publishing

Source is structured under:

- `src/audio/worklets`
- `src/audio/renderers/shared`
- `src/audio/renderers/js`
- `src/audio/renderers/wasm`

The browser worklet runtime is published into a flat runtime folder:

- `public/worklets/`

That happens through:

- [scripts/worklets/sync-worklet-runtime.mjs](/Users/eddy/code/SynthPlayground/scripts/worklets/sync-worklet-runtime.mjs)

The sync step:

- scans those source roots
- copies `synth-worklet-*` and `synth-renderer-*` files into `public/worklets`
- rewrites relative imports so the flat published runtime still works

This is why the source tree can be more structured than the final worklet runtime directory.

## Offline and Benchmark Commands

### Local development

- default dev:
  - `pnpm run dev`
- explicit JS dev:
  - `pnpm run dev:js`
- build the WASM package only:
  - `pnpm run build:wasm`

### Validation

- full repo validation:
  - `pnpm run validate`
- unit tests only:
  - `pnpm run test:unit`
- typecheck only:
  - `pnpm run typecheck`

### Local audio benchmarks

- main benchmark suite:
  - `pnpm run benchmark:audio -- --runs 2 --output artifacts/audio-benchmarks/local.json`
- compare benchmark JSON outputs:
  - `pnpm run benchmark:audio:compare -- --base artifacts/audio-benchmarks/base.json --head artifacts/audio-benchmarks/head.json`

### Local JS vs WASM parity / performance

- full JS vs WASM compare on a scenario:
  - `pnpm run benchmark:audio:js-wasm -- --scenario-id stress-3min-35tracks --runs 1 --output artifacts/audio-benchmarks/js-wasm-stress.json`
- notes-only scenario:
  - `pnpm run benchmark:audio:js-wasm -- --scenario-id notes-only-3min-35tracks --runs 1 --output artifacts/audio-benchmarks/js-wasm-notes-only.json`
- CPU profiling for one backend/scenario:
  - `pnpm run profile:audio -- --backend wasm --scenario-id stress-3min-35tracks --label wasm-stress`

### Local preset-by-preset correctness spot check

There is not currently a package script wrapper for this one. Run it directly:

- `node --import tsx scripts/audio-benchmarks/compare-js-wasm-presets.ts`

This is useful when a parity regression seems isolated to a specific preset or module family.

## PR Workflows

### Audio benchmarks in PRs

Workflow:

- [pr-audio-benchmarks.yml](/Users/eddy/code/SynthPlayground/.github/workflows/pr-audio-benchmarks.yml)

Trigger with PR labels:

- `audio-benchmarks`
  - default measured runs
- `audio-benchmarks:runs:x`
  - measured run count override

The workflow runs:

- `pnpm run benchmark:audio`
- `pnpm run benchmark:audio:compare`

and posts a sticky PR comment from `artifacts/audio-benchmarks/`.

### Screenshots in PRs

Workflow:

- [pr-screenshots.yml](/Users/eddy/code/SynthPlayground/.github/workflows/pr-screenshots.yml)

Trigger with labels:

- `screenshots`
- `screenshots:<scenario>`

### Videos in PRs

Workflow:

- [pr-videos.yml](/Users/eddy/code/SynthPlayground/.github/workflows/pr-videos.yml)

Trigger with labels:

- `videos`
- `videos:<scenario>`

## Agent References

Useful files when orienting in this area:

- renderer contract:
  - [renderers/shared/synth-renderer.d.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/shared/synth-renderer.d.ts)
- JS renderer:
  - [renderers/js/synth-renderer-js.js](/Users/eddy/code/SynthPlayground/src/audio/renderers/js/synth-renderer-js.js)
- WASM renderer:
  - [renderers/wasm/wasmSynthRenderer.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/wasmSynthRenderer.ts)
- WASM planning:
  - [renderers/wasm/wasmSubsetCompiler.ts](/Users/eddy/code/SynthPlayground/src/audio/renderers/wasm/wasmSubsetCompiler.ts)
- live worklet host shell:
  - [worklets/synth-worklet-runtime.js](/Users/eddy/code/SynthPlayground/src/audio/worklets/synth-worklet-runtime.js)
- offline host loop:
  - [offline/renderOfflineWithRenderer.ts](/Users/eddy/code/SynthPlayground/src/audio/offline/renderOfflineWithRenderer.ts)
- benchmark scenario driver:
  - [benchmarks/runBenchmark.ts](/Users/eddy/code/SynthPlayground/src/audio/benchmarks/runBenchmark.ts)
- worklet publishing:
  - [scripts/worklets/sync-worklet-runtime.mjs](/Users/eddy/code/SynthPlayground/scripts/worklets/sync-worklet-runtime.mjs)

When debugging parity or performance, a good order is:

1. confirm whether the issue is live-only or offline too
2. run preset compare if the issue seems module-specific
3. run `benchmark:audio:js-wasm` on a representative scenario
4. run `profile:audio` if the issue looks performance-related
