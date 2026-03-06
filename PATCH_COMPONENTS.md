# PATCH_COMPONENTS

## Patch Graph Overview

Instrument patches are node graphs made of:

- **Nodes**: module instances with typed params.
- **Connections**: directed links between node ports.
- **Macros**: UI controls that map one knob/slider to one or more params.
- **I/O declaration**: output node/port metadata for runtime routing.

Patch editing and validation are handled in:

- `src/lib/patch/moduleRegistry.ts`
- `src/lib/patch/ops.ts`
- `src/lib/patch/validation.ts`
- `src/components/PatchEditorCanvas.tsx`

## Signal Capabilities

All ports are `kind: "signal"` and have one or more capabilities:

- **AUDIO**: audio-rate waveform-like signal.
- **CV**: control voltage style modulation signal.
- **GATE**: gate/trig signal (typically 0/1).

Validation enforces compatibility so connections are type-safe.

## Port Kinds vs Event Types (clarification)

There are two different type systems in this codebase:

- **Patch port kind** (inside patch graphs): currently only `kind: "signal"` in MVP.
- **Transport/event message types** (between scheduler and worklet): `NoteOn`, `NoteOff`, `ParamChange`.

`NoteOn`/`NoteOff`/`ParamChange` are **not** patch ports. They are timeline control events delivered to the runtime, which then update per-voice host values/params used by signal ports.

Within `kind: "signal"`, capability typing is the second layer:

- `AUDIO`
- `CV`
- `GATE`

Future versions can add other patch port kinds (for example event ports), but this MVP keeps patch wiring signal-only.

## How Modules Wire Together (High Level)

Typical voice chain:

```text
Host note sources (pitch/gate/velocity)
   -> sound source (VCO / Noise / SamplePlayer)
   -> optional shaping (VCF / Saturation / Overdrive / Compressor / etc.)
   -> VCA (often controlled by ADSR)
   -> Output node
```

Common modulation pattern:

```text
LFO/ADSR (CV)
   -> module modulation input (pitch/fm/pwm/cutoff/gainCV/...)
```

## Host-Provided Inputs

Patches can use host sources injected by runtime:

- `NotePitch`
- `NoteGate`
- `NoteVelocity`
- `ModWheel`

These provide per-voice note/control context without user manually adding host nodes.

## Why This Component Model

- Keeps patch editing constrained and predictable for MVP.
- Makes graphs machine-transformable (ops + validation).
- Keeps runtime execution straightforward (typed, directed graph, no feedback cycles).
