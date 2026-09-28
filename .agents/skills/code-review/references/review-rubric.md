# SynthPlayground review rubric

Apply the relevant checks to the current diff and its consumers. Report concrete defects or improvements with evidence and a bounded remedy.

## Required analysis

- Identify the independent behavioral dimensions affected by the change, such as state, position, timing, lifecycle phase, input source, empty/non-empty conditions, and boundaries. Review representative combinations and transitions, especially those absent from tests.
- Trace every crossed abstraction, ownership, subsystem, or execution boundary. Verify identity, state, events, errors, cleanup, and accessibility across it.
- When an invariant or owner changes, enumerate downstream consumers that relied on the previous behavior. Confirm each consumer remains valid, is updated, or is intentionally detached.
- When a change uses a newer platform, language, framework, or runtime capability, verify supported environments and require a functional fallback or an explicit compatibility boundary.
- Derive regression tests from the identified risks and boundary cases, not only from advertised behavior or existing happy paths.

## Architecture

- Keep AppRoot and top-level views focused on composition and ownership. Extract cohesive interactions into hooks, transformations into domain helpers, and distinct surfaces into components.
- Use child-specific `{ model, actions }` slices. Avoid long prop lists, whole-controller dependencies, and passthrough through unrelated shells.
- Give project lifecycle, workspace, preview, rendering, and persistence state clear owners. Name hooks and controllers for their responsibilities.
- Keep DSP in Rust/WASM and runtime coordination in AudioWorklet. Generate public worklet files from their source tooling.
- For touched files over 1,000 lines, identify practical extractions that reduce coupling or improve testability. Report unrelated size debt without expanding the PR.

## Contracts and readability

- Model alternative states with discriminated unions. Use narrow domain types and keep TypeScript, JS declarations, Rust, and worklet messages aligned.
- Encode behavior in typed options, not action-name prefixes or display labels. Validate external input at its boundary and surface violated internal invariants instead of returning arbitrary defaults.
- Derive shared constants and lists from authoritative schemas or metadata. Import typed definitions in tooling rather than parsing source text. Check generated manifests and constants.
- Coalesce logic with matching semantics. Verify consumers before removing dead exports, callbacks, refs, styles, or compatibility paths.
- Name units and coordinate spaces explicitly: beats, seconds, samples, display coordinates, and model coordinates. Use clear names for identities, state, and non-obvious thresholds.
- Preserve comments that explain ownership, invariants, timing, units, or algorithms. Avoid comments that merely repeat names.

## State and persistence

- Preserve immutable project snapshots, no-op identity, atomic edits, history coalescing, and undo/redo restoration of dependent tabs and selections.
- Trace sample metadata and binary assets through import, autosave, switching, undo, and renderer startup. Pair each project snapshot with its assets, order dependent writes, and preserve assets still owned by other snapshots.
- Normalize imported data into a canonical model before runtime/compiler use. Preserve shipped compatibility and fresh import identities; remove compatibility for never-shipped intermediate formats.
- Keep schema, normalization, validation, compiler, UI, presets, and fixtures aligned. Migrate parameter units in bindings, curves, and stored ranges too. Check patch schema versions, preset versions, and manifest freshness separately.
- Keep high-frequency drag, wheel, and preview drafts local until their intended commit point. Preserve settings that the design deliberately persists.

## Correctness

- Check beat zero, exact loop boundaries, same-sample note ordering, mid-loop cues, composition end, empty/multiple tracks, mute/edit/unmute, preview release/replacement, tab churn, cold recording startup, and cancellation during asynchronous work.
- Ensure stale completions cannot stop a newer session or overwrite its state. Verify acquire/reset/release/dispose ownership and bounded retries/finalization.
- Trace cut/copy/paste/insert/delete/explode through notes, automation, loop markers, composition end, track identities, serialization, and undo.
- Preserve `AUDIO`/`CV`/`GATE` compatibility. Distinguish locally valid repair gestures from whole-patch validity.
- Report errors with structured code, severity, cause, and useful context. Surface actionable failures without presenting warnings as fatal errors.

## Interaction and performance

- Check hit testing against painted geometry, scroll, zoom, layering, and fixed overlays. Verify priorities separately for selection, wiring, and probe attachment.
- Keep focus, selection, hover, playhead, and edit mode distinct. Scope shortcuts to the active workspace/control; verify editable inputs, propagation, focus handoff, help text, and capture selectors.
- Use component-owned CSS Modules and shared tokens. Use semantic data hooks for automation. Remove obsolete global styles and check canvas resize/redraw behavior after layout changes.
- Match module faces and probes to DSP units, axes, ranges, and zero/identity behavior. Verify appearance with captures and sound with listening or signal tests.
- Check audio hot paths for allocation, repeated lookup/branching, copying, serialization, unbounded buffers, and expensive finalization. Move invariant work to planning/startup and require measurements for performance claims.

## Verification

- Confirm callers before declaring code dead and compare semantics before claiming duplication. Explain the concrete maintenance or readability benefit of a proposed refactor.
- Recommend regression tests for unprotected behavior, including hook/worklet/persistence boundaries where helper tests are insufficient. Keep tests near the relevant module; avoid tests that restate implementation details.
- Build real WASM artifacts for tests that require them. Do not treat fake-audio captures as audio validation. Check clean/ignore rules when generated outputs change.
- Follow `AGENTS.md` for validation and visual/audio evidence. Report coverage gaps accurately; keep read-only reviews free of implementation changes.
- Include useful low-priority improvements and defer fixes that require substantial scope expansion.
