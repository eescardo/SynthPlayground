# Synth Playground

Browser-based music synthesis + composition MVP built with Next.js, TypeScript, WebAudio, AudioWorklet, and Rust->WASM DSP primitives.

## Implemented MVP Surface

- Track editor canvas (insert/move/resize/delete notes)
- QWERTY record mode (note insert at playhead)
- Transport (play/stop, tempo/meter/grid)
- Patch editor canvas (add/move/delete nodes, connect/disconnect ports)
- Patch param inspector + macro exposure/binding
- Patch validation (typed ports, single-input checks, cycle checks, output checks)
- Patch transform ops with undo/redo history
- Preset instrument patches (Bass, Brass-ish, Simple Piano-ish, Pad, Pluck, Drum-ish)
- Lookahead scheduler feeding AudioWorklet events
- AudioWorklet synth runtime with per-track polyphony/voice stealing and track/master FX
- IndexedDB persistence (`idb`) + Export/Import project JSON
- Rust WASM DSP crate scaffold (`rust/dsp-core`) with exported sample processors

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To run dev mode after compiling the Rust WASM artifact first:

```bash
npm run dev:wasm
```

To run in strict mode (requires WASM artifact to load; no silent fallback):

```bash
npm run dev:wasm:strict
```

## Build

```bash
npm run build
```

## Optional WASM Build

Requires `wasm-pack` installed:

```bash
npm run build:wasm
```

This emits artifacts into `public/wasm/pkg`.
