# Artifacts

Use this directory for temporary review artifacts produced during agent work, especially UI changes.

## Conventions

- Screenshots: `artifacts/screenshots/`
- Browser traces: `artifacts/traces/`
- Videos: `artifacts/videos/`

## Screenshot Labels

Playwright screenshot capture stores files under `artifacts/screenshots/<label>/`.

- Default label: `local`
- Example before capture: `SCREENSHOT_LABEL=before pnpm run test:ui:capture:main-view`
- Example after capture: `SCREENSHOT_LABEL=after pnpm run test:ui:capture:main-view`

Named scenarios currently include:

- `main-view`
- `help-modal`
- `record-mode`
- `patch-editor`

These artifacts are for review and debugging, not source control history. The directories are ignored by git except for this README.
