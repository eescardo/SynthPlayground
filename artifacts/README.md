# Artifacts

Use this directory for temporary review artifacts produced during agent work, especially UI changes.

## Conventions

- Screenshots: `artifacts/screenshots/`
- Browser traces: `artifacts/traces/`
- Videos: `artifacts/videos/`

## Screenshot Labels

Playwright screenshot capture stores files under `artifacts/screenshots/<label>/`.

- Default label: `local`
- Example before capture: `SCREENSHOT_LABEL=before pnpm run test:ui:capture -- main-view`
- Example after capture: `SCREENSHOT_LABEL=after pnpm run test:ui:capture -- main-view`

Named scenarios currently include:

- `main-view`
- `help-modal`
- `record-mode`
- `patch-editor`

These names are defined once in `scripts/ui-screenshots/scenarios.ts` and reused by both the screenshot scripts and the GitHub workflow helpers.
The actual capture behavior for each scenario lives in `scripts/ui-screenshots/`.

## GitHub Workflow

The `PR Screenshots` workflow can generate before and after screenshot artifacts for a PR branch.

- Input `pr_number`: target PR number
- Input `scenarios`: `all` or a comma-separated list such as `main-view,patch-editor`
- PR label `screenshots`: run all scenarios
- PR label `screenshots:<scenario>`: run only that scenario
- Multiple `screenshots:<scenario>` labels can be combined

The workflow uploads separate `before` and `after` artifacts and leaves a PR comment with inline image previews plus download links.

Current implementation detail:

- The inline PR comment images are published to a dedicated utility branch named `pr-screenshot-previews`.
- That branch is reusable scratch space for generated preview assets and may grow over time.
- If the branch is deleted, the workflow will recreate it on the next run.

Future improvements to consider:

- switch to GitHub Pages or another ephemeral image-hosting approach
- post images via uploaded issue comment assets instead, if we want to avoid the preview branch model entirely

These artifacts are for review and debugging, not source control history. The directories are ignored by git except for this README.
