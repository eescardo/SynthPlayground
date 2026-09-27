---
name: pr-digest
description: Explain a SynthPlayground PR with progressive disclosure, from TL;DR through architecture to a guided module and function reading path. User-invoked; read-only.
---

# PR digest

Accept `/pr-digest [PR] [additional instructions] [model]` or `$pr-digest` with the same arguments. Resolve the target using [the shared PR context rules](../code-review/references/pr-context.md), including same-conversation default and ambiguity choices. Additional instructions adjust depth, audience, or emphasis. This is an explanation, not a code review or permission to change the PR.

Pin the base/head and read the complete aggregate diff, affected code, and relevant tests. Use the final implementation as truth; PR prose and commit messages provide intent to verify, not a substitute for code. Explain the resulting change, not every abandoned iteration. Read architecture docs when needed, and flag stale docs rather than repeating their claims.

Use progressive disclosure in this order, scaling length to the PR:

1. **TL;DR:** One to three sentences describing the problem, changed behavior, and practical consequence. Identify the PR and reviewed SHA. A concrete before/after example is useful for a behavioral change.
2. **Architecture:** Explain the relevant entry points, ownership, boundaries, and data/control flow that were added or changed. Distinguish new behavior from extraction/reorganization. For stateful changes, trace who creates, updates, persists, renders, and disposes of the state. Include tradeoffs only when supported by code or explicit intent. A compact diagram is optional when it clarifies a complex flow.
3. **Modules:** Group changed files by responsibility. For each important module, explain what it owns, its contract and collaborators, and what changed. Avoid an exhaustive file inventory and long lists of renamed files.
4. **Read this next:** An ordered reading path through the most informative modules/functions, with verified path/line links and one sentence per stop explaining what to learn there. Start from the public entry or orchestration, follow the core transformation/algorithm/state transition, then its runtime/persistence boundary and the test that best demonstrates the invariant. Prefer a handful of meaningful stops; do not impose a fixed count on small PRs.
5. **Validation and limits:** Summarize verified checks, meaningful tests, migration/compatibility consequences, and any UI/audio inspection needed. Distinguish tests present in code from tests actually run or CI results retrieved. Mention material uncertainty succinctly; do not manufacture review findings or an approval verdict.

Link to the reviewed SHA when using GitHub code permalinks, or verified current PR diff lines when using app review links. Local links must use absolute paths to the inspected checkout. Do not link to today's unrelated local line numbers. If the PR changes during analysis, refresh the digest or explicitly scope it to the older SHA. Return the digest in the main conversation; do not post it to GitHub without an explicit request.
