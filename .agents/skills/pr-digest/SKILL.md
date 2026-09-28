---
name: pr-digest
description: Explain a SynthPlayground PR from TL;DR through architecture, modules, and an ordered function-level reading path. User-invoked; read-only.
---

# PR digest

Accept `/pr-digest [PR] [additional instructions] [model]` or `$pr-digest`. Follow [PR context rules](../code-review/references/pr-context.md). Use additional instructions to adjust depth, audience, or emphasis.

Pin the reviewed revision. Read the complete aggregate diff, affected code, relevant tests, and applicable architecture docs. Verify PR-description claims against the final implementation and flag stale documentation.

Present, in order:

1. **TL;DR:** Identify the PR/SHA and explain the problem, changed behavior, and practical consequence in one to three sentences.
2. **Architecture:** Explain changed entry points, ownership, boundaries, and data/control flow. Distinguish new behavior from reorganization. Trace state creation, updates, persistence, rendering, and disposal where relevant.
3. **Modules:** Group important changed files by responsibility. Explain their contracts, collaborators, and changes; omit an exhaustive file inventory.
4. **Read this next:** Give an ordered path through the most informative modules/functions with verified line links and what to learn at each stop. Follow entry/orchestration → core logic → runtime/persistence boundary → representative test.
5. **Validation and limits:** Summarize checks, meaningful tests, compatibility consequences, uncertainty, and outstanding UI/audio inspection. Distinguish tests present from checks actually run. Do not add an approval verdict.

Scale detail to the PR. Use code permalinks at the reviewed SHA, verified current PR diff links, or absolute paths in the inspected checkout. If the PR changes, refresh the digest or scope it explicitly to the older revision. Return it in the main conversation without editing code or posting to GitHub unless separately requested.
