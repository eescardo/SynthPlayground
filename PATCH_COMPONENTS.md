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

## Preset Metadata And Lineage

Patch definitions carry a small metadata envelope describing whether a patch is a bundled preset or a project-owned custom instrument.

- `meta.source: "custom"` means the patch is fully project-owned and has no preset lineage semantics.
- `meta.source: "preset"` means the patch is a saved snapshot derived from a bundled preset and also carries:
  - `presetId`: stable preset family identifier
  - `presetVersion`: bundled preset version the snapshot came from

Projects still save the full patch snapshot, including nodes, connections, macros, and layout. This keeps old projects playable even if bundled presets later change or disappear.

## Preset Updates And Legacy Presets

Preset evolution follows a snapshot-first model.

- If a bundled preset with the same `presetId` exists and has a newer `presetVersion`, the project patch is treated as `Preset Update Available`.
- If no bundled preset with that `presetId` exists anymore, the saved snapshot is treated as a `Legacy Preset`.

Updating a preset replaces the saved preset snapshot with the latest bundled snapshot, preserves matching saved layout entries by `nodeId` where possible, and discards stale layout entries without blocking migration. Track-level macro values remain outside the patch definition and are preserved independently.

Preset compatibility is intentionally defined in terms of the user-facing macro API, not internal node wiring. Internal graph structure may change across preset versions as long as the preset family remains macro-compatible.

## TODO

- Replace broad legacy recovery paths in project normalization with explicit schema-version migrations once the file format stabilizes after MVP.
- Stop inferring missing preset/custom metadata from patch IDs once all persisted projects have been migrated to the current schema.
- Tighten import validation so malformed project JSON fails with versioned migration errors instead of permissive fallback recovery.
- Expand preset-update tests to cover layout preservation/discard behavior and legacy-preset UI states.
