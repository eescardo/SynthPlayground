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
- If validation is green, commit and open or update a PR.
- PR title format: `[Agent PR] <Task summary name>`
- PR body should include a `## Summary` section with bullet points for each feature, fix, or cleanup included in the task.

## Task Branch and PR Workflow

Treat each substantial user request as either:

- a new task that should get its own branch and PR, or
- a follow-up to an existing unlanded task branch / PR

Never commit or push directly to `main` / `origin/main`.

- Before creating a new task branch, update the local checkout from `origin/main` and rebase or realign so new work starts from current main.
- Always work on a task-specific branch.
- After pushing the task branch to the remote, open or update a PR.
- PRs should be opened as ready for review by default, unless explicitly requested otherwise.

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

- Add before and after screenshots to the PR.
- Add video captures for changes that affect record mode, transport/playback flows, instrument presets, or anything else that could change playback behavior in ways a short motion capture helps review.
- `Before` screenshots mean captures generated from the PR base revision, typically `origin/main`.
- `After` screenshots mean captures generated from the task branch / PR head revision.
- Save screenshots under `artifacts/screenshots/`
- Save browser traces under `artifacts/traces/`
- Save videos under `artifacts/videos/`
- Update the Playwright-based capture scripts in `scripts/ui-screenshots/` and `scripts/ui-videos/` and keep `tests/ui/` validation aligned when UI changes affect captured states, selectors, or relevant user flows.
- To attach screenshots to a PR, use the `PR Screenshots` GitHub workflow:
  - add PR label `screenshots` to capture all supported scenarios, or
  - add one or more `screenshots:<scenario>` labels such as `screenshots:main-view` or `screenshots:patch-editor`
- Those labels trigger the workflow to generate `before` screenshots from the PR base revision and `after` screenshots from the PR branch, upload both artifacts, and post or update a sticky PR comment with previews and download links.
- To attach videos to a PR, use the `PR Videos` GitHub workflow:
  - add PR label `videos` to capture all supported video scenarios, or
  - add one or more `videos:<scenario>` labels such as `videos:play-from-start-5s` or `videos:record-from-start-8s`
- Those labels trigger the workflow to capture PR-head videos from the task branch only, upload the artifact bundle, and post or update a sticky PR comment with hosted preview links and downloads.
- Video captures are useful for motion and flow review, but they are not a substitute for manual audio listening when the change is primarily about sound.
- If capture tooling is not available yet, include a short manual verification checklist in the handoff.
- PR descriptions for UI changes should say what changed visually and what to inspect.

## Tests

- If you change `src/lib/patch/*`, update tests in `src/lib/patch/tests/` when behavior changes.
- If you change shared utilities, update tests in `src/lib/tests/` when behavior changes.
- If a UI change has weak automated coverage, say that explicitly rather than implying the repo is fully protected by tests.
- After iterating on a complex feature with the user, do a deliberate cleanup pass before handoff: look for dead code introduced during iteration and add targeted unit tests for the trickiest regression-prone behavior.

## Refactors

- If a file grows beyond 1000 lines, treat that as a prompt to refactor when doing so is practical and improves readability.
- Prefer extracting cohesive modules or helpers over letting one file continue to absorb unrelated responsibilities.
- If the file is already above that threshold and a safe refactor is out of scope for the current task, call that out in the handoff.

## Parallel Work

Parallelization works best when tasks have mostly independent write scopes.

- Prefer splitting work by owned files or modules, not by vague feature labels.
- If multiple tasks need the same shared file, keep that integration in one place instead of having multiple agents edit it in parallel.
- Before starting broad refactors or shared-plumbing edits, check whether another task is already likely to touch the same area.
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

When finishing a task, report the following in the final chat response. Include the same information in the PR body when it is relevant.

A task here means the current user request being implemented on a task branch. A task may result in a new PR or an update to an existing unlanded PR.

Report:

- files changed
- commands run
- whether validation fully passed
- whether UI review is still recommended
- known risks or follow-up work
