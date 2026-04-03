# CODEX.md

This file adds Codex-specific workflow guidance on top of `AGENTS.md`. Follow `AGENTS.md` first, then use the rules below for task lifecycle and GitHub operations.

## GitHub Operations

Prefer the GitHub MCP connector for remote GitHub operations when available.

- Use MCP to create branches, commits, and pull requests when local SSH push is unavailable or unnecessary.
- Do not assume local SSH credentials are present or correctly configured.
- If local git push works, it is fine to use it. If it fails due to auth or network constraints, fall back to MCP rather than blocking on SSH setup.
- If `gh` is available and authenticated, it may be used for GitHub operations that are not exposed through MCP, such as workflow dispatch.

## Status Checks

This repo uses separate PR checks rather than one combined "validate" gate.

Current expected checks:

- `Preset Compatibility`
- `Validate Build`
- `Run Tests`

When discussing merge readiness, refer to those check names explicitly.
