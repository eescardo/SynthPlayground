---
name: synthsprout-release-notes
description: Summarize SynthSprout commits since the previous deploy/v* release tag and update the release notes that feed the About page.
metadata:
  short-description: Update SynthSprout release notes
---

# SynthSprout Release Notes

Use this skill when the user asks to draft, update, or summarize release notes for SynthSprout.

## Workflow

1. Fetch tags and main.
2. Find the latest release tag with `git tag --list 'deploy/v*' --sort=-version:refname | head -1`.
3. Inspect commits since that tag with `git log <tag>..HEAD --oneline --no-merges`. If no tag exists, inspect the relevant initial-release range with the user or summarize the current main history.
4. Write user-facing notes in `src/content/releaseNotes.ts`.
5. Keep entries compact: one short summary and 3-6 bullets.
6. Group raw commit detail into product language. Prefer sections such as composer, patch workspace, audio, export/import, reliability, and cleanup only when those labels help.
7. Do not claim analytics, backend storage, collaboration, accounts, or uploads exist unless the commits show that behavior.
8. Run `pnpm run typecheck` after editing the release note data.

## Style

- Lead with what changed for someone using the app.
- Mention internal work only when it explains a visible improvement or release confidence.
- Avoid raw commit hashes in the About page data.
- Keep unpublished notes under a clear version entry supplied by the user.
