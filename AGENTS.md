# AGENTS.md

This repo is a browser-based music composition and synthesis playground built with Next.js, TypeScript, WebAudio, and a Rust/WASM DSP path.

## Commands

- Install deps: `pnpm install`
- Local dev: `pnpm run dev`
- Strict WASM dev: `pnpm run dev:wasm:strict`
- Unit tests: `pnpm run test:unit`
- Typecheck: `pnpm run typecheck`
- Lint: `pnpm run lint`
- Build: `pnpm run build`
- Full validation before handoff: `pnpm run validate`

## Repo Shape

- App shell and top-level orchestration: `app/`
- Audio runtime and scheduler: `src/audio/`
- Track and patch editor UI: `src/components/`
- Reusable editor hooks: `src/hooks/`
- Patch definitions, registry, presets, and validation: `src/lib/patch/`
- Shared music/project utilities: `src/lib/`
- Type contracts: `src/types/`
- Active JS AudioWorklet runtime: `public/worklets/synth-worklet.js`
- Rust/WASM DSP crate: `rust/dsp-core/`

## Delivery Contract

When asked to make code changes, aim for end-to-end delivery, not just a patch.

- Make the change.
- Run the narrowest relevant checks while iterating.
- Before handoff, run `pnpm run validate` if the change is ready to land.
- If validation is green and the change does not affect UI or UX, it is reasonable to commit and open/update a PR.
- If the change affects UI or UX, do not treat green automated checks as sufficient by themselves. Include review artifacts or a manual verification checklist before merge.

## Task Branch and PR Workflow

Treat each substantial user request as either:

- a new task that should get its own branch and PR, or
- a follow-up to an existing unlanded task branch / PR

When the mapping is clear from context, proceed. When it is ambiguous, ask a short clarifying question before making branch or PR changes.

Examples of ambiguity:

- the user asks for "one more cleanup" after a previous PR exists, but does not say whether to stack onto it or start fresh
- the current branch already has an open PR and the new request looks unrelated

Typical order:

1. create or switch to the task branch
2. make the change
3. run relevant validation
4. commit locally
5. update the existing PR if this is the same task, otherwise open a new PR

## UI Changes

For visual or interaction changes, automated validation is necessary but not sufficient.

- Save screenshots under `artifacts/screenshots/`
- Save browser traces under `artifacts/traces/`
- Save videos under `artifacts/videos/`
- If capture tooling is not available yet, include a short manual verification checklist in the handoff.
- PR descriptions for UI changes should say what changed visually, what to inspect, and whether screenshots or videos are attached.

## Tests

- If you change `src/lib/patch/*`, update tests in `src/lib/patch/tests/` when behavior changes.
- If you change shared utilities, update tests in `src/lib/tests/` when behavior changes.
- If a UI change has weak automated coverage, say that explicitly rather than implying the repo is fully protected by tests.

## Parallel Work

Parallelization works best when tasks have mostly independent write scopes.

- Prefer splitting work by owned files or modules, not by vague feature labels.
- If multiple tasks need the same shared file, keep that integration in one place instead of having multiple agents edit it in parallel.
- Before starting broad refactors or shared-plumbing edits, pause and check whether another task is already likely to touch the same area.
- There is no built-in ad-hoc work-in-flight manifest in this repo yet, so be conservative around shared orchestration files and top-level docs.

## Audio Notes

- Sample rate is fixed at 48kHz in the app model.
- The active synthesis path today is still the JS AudioWorklet runtime in `public/worklets/synth-worklet.js`.
- Be careful with scheduler, transport, and worklet timing changes. Regressions often show up at beat 0, at track end, or when multiple tracks interact.

## Patch Notes

- Host patch inputs are defined in `src/lib/patch/constants.ts`.
- Patch presets, validation, and registry logic should stay aligned.
- Keep typed signal compatibility rules intact: `AUDIO`, `CV`, and `GATE`.

## Handoff

When finishing a task, report:

- files changed
- commands run
- whether validation fully passed
- whether UI review is still recommended
- known risks or follow-up work
