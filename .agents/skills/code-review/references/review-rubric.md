# SynthPlayground review rubric

This rubric distills retained PR evolution, not a generic style checklist. The [evidence analysis](history-analysis.md) separates explicit follow-up explanations from inferred preferences; the [coverage ledger](pr-history.md) includes every PR available at the research snapshot. Read those only when provenance or a nuanced precedent matters. Apply the rubric to the current diff and its actual consumers; historical preferences are not blanket refactor mandates.

## Architecture and responsibility

- Keep AppRoot and top-level views focused on composition and ownership. Put cohesive interactions in hooks, reusable transformations in domain helpers, and independently understandable surfaces in components. A worthwhile extraction has a nameable responsibility, smaller dependency surface, or independently testable behavior. Moving a long block into a giant helper without reducing coupling is not enough.
- Follow `{ model, actions }` boundaries through the relevant component tree, using child-specific slices. Avoid immediately unpacking a session back into a long prop list, or passing the whole application/controller to a child that needs a small capability. Do not group a few already-clear props purely for uniformity.
- Keep project lifecycle, workspace state, preview state, rendering, and persistence ownership distinct. Choose the closest legitimate owner; avoid state/handler passthrough through unrelated shells. Name hooks, providers, and controllers according to what they actually own.
- Respect the current architecture: Rust/WASM is the active DSP renderer, AudioWorklet coordinates runtime behavior, and generated public worklet files come from source tooling. Historical JS/WASM coexistence is not a reason to add a second fallback renderer.
- A touched file over 1,000 lines prompts a practical cohesion check, not a mandatory broad rewrite. Report concrete extraction opportunities and their payoff; disclose pre-existing size debt outside this PR's scope.

## Contracts, sources of truth, and readability

- Prefer discriminated unions for alternative states over bags of optional fields and defensive probing. Use named domain types at meaningful boundaries; narrow `Project`/controller inputs when only global timing or a small state slice is needed. Keep JS declaration files, TypeScript, Rust, and worklet messages aligned.
- Keep behavior explicit in typed options/data. Do not infer semantic behavior from action-key prefixes, human labels, or other incidental strings. Make invariants fail visibly when a normalized internal state cannot occur; do not hide missing processors or uncovered table cases with arbitrary defaults. Validate unknown external input at its boundary.
- Derive shared values from their authoritative schema, metadata, or generator. Avoid parallel lists of node parameters, probe defaults, host port names, and automation kinds. Import TypeScript definitions in tooling rather than parsing source text manually. Keep generated manifests/constants reproducible and checked.
- Coalesce repeated logic when semantics match; do not merge superficially similar helpers with different domain behavior. Remove dead exports, obsolete callbacks, stale refs/styles, and superseded compatibility paths after checking consumers.
- Name quantities and units: beat vs seconds vs samples, display vs model coordinates, cue vs playhead, patch identity vs preset lineage, persisted state vs local draft. Name non-obvious thresholds and layout constants where they convey a rule or shared meaning; avoid a constant for every self-evident literal.
- Use comments for ownership, invariants, units, timing, or a non-obvious algorithm, especially DSP and scheduling. Preserve useful function-level explanations through refactors. Do not ask for comments that only repeat names.

## State integrity, persistence, and compatibility

- Project snapshots are immutable; identity-based compile caches and undo depend on replacement values. Check no-op identity preservation, atomic related edits, history coalescing, and whether undo/redo restores dependent workspace/tab/selection state.
- Trace asset metadata and binary payloads across import, autosave, project switching, history, and renderer startup. Ensure each save pairs the correct project snapshot with its asset snapshot, serializes dependent writes, and cannot pair project A with assets B. Deleting a live object must not invalidate an undoable snapshot or another owner.
- Normalize legacy or unknown input once into a canonical model. Runtime/compiler code should not repeatedly accommodate old schema variants. Preserve real shipped compatibility and fresh identities on import; do not manufacture migrations for intermediate representations that never landed.
- Check schema, normalization, validation, compiler, UI, presets, and fixture agreement for parameter/port changes. Unit changes must migrate bindings, keyframe curves, and stored ranges as well as node parameters. Patch schema version and bundled preset version serve different purposes; one does not replace the other. Verify manifest freshness.
- Probe, drag, expansion, focus, and preview state need deliberate ownership. High-frequency drafts should not create persistent project/history updates on every pointer/wheel event when commit-on-release is intended. Do not universalize transient-state policy: preserve settings deliberately persisted by the current design.

## Correctness at transitions

- Test the transitions most often repaired in this history: beat zero; exact loop boundaries and same-sample note-off/note-on ordering; mid-loop cue; composition end; empty tracks; multiple tracks; mute/edit/unmute; preview replacement/release; rapid workspace/tab changes; cold record startup; cancel/restart/unmount during asynchronous work.
- Trace asynchronous completion ownership. A stale startup must not stop a newer session; stale preview/probe data must not overwrite the active session. Verify acquire/reset/release/dispose ownership and bounded retry/finalization behavior.
- Preserve timeline semantics through cut/copy/paste/insert/delete/explode, including automation, loop markers, explicit/follow end positions, and source/target track identity. Follow derived values through serialization and undo, not just the visible edit.
- Typed patch connections must retain `AUDIO`/`CV`/`GATE` rules. A partially invalid editable patch may still need to allow a locally valid repair; distinguish local candidate validity from whole-patch validity.
- Keep errors structured with code, severity, useful cause/context, and a visible actionable failure where appropriate. Silent success defaults at internal boundaries make real failures harder to diagnose. Avoid reporting warnings as fatal UI errors.

## Interaction, visuals, and performance

- Validate hit testing against painted geometry, scroll, zoom, layering, and fixed overlays. Different gestures can require different priority (normal module selection vs wire/probe attachment). Do not “fix” one gesture by breaking another.
- Keep keyboard focus, selection, hover, playhead, and edit mode distinct. Scope shortcuts to workspace/focused controls, preserve editable-input behavior, and verify propagation and focus handoff. Keep help text and capture selectors aligned with actual interactions.
- Prefer component-owned CSS Modules for local styles and shared tokens for shared geometry/colors. Use semantic data hooks for automation rather than unstable CSS-module names. Delete obsolete global rules when ownership moves; check resize/redraw/layout effects for canvas regressions.
- Module faces and probes must tell the truth about DSP semantics, units, zero/identity behavior, axes, and effective ranges. Screenshots verify appearance; listening and signal/behavior tests verify sound.
- In audio hot paths, look for per-sample allocation, redundant branching/lookup, excessive copying/serialization, unbounded capture buffers, and expensive finalization on the real-time callback. Move invariant work to planning/startup and use bounded incremental work where appropriate. Require measured workload evidence for performance claims, without treating every unmeasured optimization as a bug.

## Verification and proportionality

- Trace each plausible finding to a concrete behavior, contradiction, or maintenance cost. Do not turn a preference into a finding without showing how it affects this change. Check callers before declaring dead code and both paths before claiming duplication.
- Recommend focused regression coverage for the tricky invariant, including hook/worklet/persistence boundaries when a pure-helper test misses the actual failure. Keep tests near the relevant module per repository convention; avoid tests that restate the implementation or depend on incidental source text.
- Check the real WASM artifact is built for tests that require it; fake audio capture is not audio validation. Verify build/runtime outputs and clean/ignore rules when generated artifacts change.
- Follow `AGENTS.md` for validation, before/after screenshot labels, playback video labels, and manual audio review. Report missing evidence accurately; a green typecheck does not establish interaction or audio correctness. For read-only review, report check gaps rather than modifying the PR to satisfy delivery rules.
- Include actionable maintainability and readability improvements, even when low priority. Explain a smaller coherent remedy and defer large architectural changes rather than expanding the PR by default.
