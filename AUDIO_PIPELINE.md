# AUDIO_PIPELINE

## A) High-Level Data Flow (Track Notes -> Speaker Output)

```text
[TrackCanvas UI]
    |
    | user edits notes (pitchStr, startBeat, durationBeats, velocity)
    v
[React Project State (app/page.tsx)]
    |
    | persisted to IndexedDB, exported/imported as JSON
    v
[AudioEngine (src/audio/engine.ts)]
    |
    | play(startBeat)
    | - converts beat/time -> sample domain
    | - schedules NoteOn/NoteOff events in sample time windows
    v
[Scheduler (src/audio/scheduler.ts)]
    |
    | collectEventsInWindow(...)
    v
[AudioWorklet Port Messages]
    |
    | TRANSPORT / EVENTS / MACRO / SET_PROJECT
    v
[Synth AudioWorklet (public/worklets/synth-worklet.js)]
    |
    | per sample block:
    | - consume due events
    | - update per-track voice state
    | - render patch node graph per voice
    | - mix track audio
    | - apply track FX + master FX
    v
[AudioWorkletNode output buffer]
    v
[AudioContext Destination]
    v
[System Audio Output]
```

## B) Shared DSP Abstraction (JS + WASM)

The project uses a shared conceptual abstraction:

- **Modules/nodes** process sample streams (AUDIO/CV/GATE) and state.
- **Events** (NoteOn/NoteOff/ParamChange) mutate voice/parameter state at sample-accurate times.
- **Per-voice runtime** executes a compiled node order and emits track samples.
- **Mix stage** combines tracks and applies master processing.

This abstraction has two implementations:

1. **JavaScript runtime (current active synthesis path)**
   - Implemented in `public/worklets/synth-worklet.js`.
   - Executes full module graph and effects in the AudioWorklet thread.

2. **WASM module (currently utility/scaffold path)**
   - Rust crate in `rust/dsp-core` exports DSP primitives.
   - Loaded through `src/audio/wasmBridge.ts`.
   - In strict mode (`NEXT_PUBLIC_STRICT_WASM=1`), startup fails fast if WASM cannot load.

### Current Runtime Reality (important)

Today, loading WASM **does not replace** the `public/worklets/synth-worklet.js` synthesis graph execution path.

- Active synthesis still runs in JS worklet runtime.
- `loadDspWasm()` currently provides readiness gating + exported utility access.
- In `app/page.tsx`, strict mode state (`strictWasmReady`) only gates transport start and error reporting.
- `wasmBridge` keeps a module-level cache (`cachedWasm`), but there is no injected DSP engine interface yet.

Put differently: there is no global engine switch today that swaps full JS graph execution for a full WASM graph engine.

### What `loadDspWasm()` changes today

`loadDspWasm()` currently affects app readiness state, not backend selection:

- `src/audio/wasmBridge.ts` imports bindgen JS, initializes `.wasm`, and caches exports in module state (`cachedWasm`).
- `app/page.tsx` uses the load result to set `strictWasmReady` / `runtimeError`.
- In strict mode, `Play` is blocked until WASM load succeeds.

What it does **not** do today:

- It does not set a global "use WASM engine" flag consumed by the worklet.
- It does not switch `public/worklets/synth-worklet.js` to a WASM execution backend.
- It does not replace scheduler/event logic or the graph compiler used by the JS worklet runtime.

### Fallback behavior

- Non-strict mode: if WASM fails to load, app continues with JS runtime.
- Strict mode: startup enforces successful WASM loading, otherwise UI shows runtime error and blocks `Play`.

### Planned interface pattern (recommended)

To make replacement explicit, define a runtime interface that both backends implement, then inject it into `AudioEngine`/worklet plumbing:

```text
SynthRuntimeBackend
  - init(project, sampleRate, blockSize)
  - applyEvents(events)
  - processBlock(outL, outR)
```

- JS backend: wraps current `synth-worklet.js` graph execution.
- WASM backend: wraps a compiled WASM graph executor.
- Selection: explicit at startup (env/config/capability probing), instead of implicit readiness-only checks.

## Song-Time vs Global Processor Time

Two time domains are intentionally separated:

- **Song-time**
  - Musical timeline used by editor/scheduler.
  - Units: beats and song sample positions derived from tempo.
  - Drives note placement and scheduling windows.

- **Global processor time**
  - Continuous time of AudioContext/worklet processing.
  - Units: processed samples/blocks since context running.
  - Worklet advances `songSampleCounter` only while transport is playing.

Why separation matters:

- You can start playback from any beat without resetting global AudioContext lifetime.
- Scheduler converts song-time events into sample timestamps consumed by the worklet.
- Looping and transport controls adjust song-time mapping without requiring context recreation.
