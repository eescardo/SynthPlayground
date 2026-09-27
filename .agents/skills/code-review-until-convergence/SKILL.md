---
name: code-review-until-convergence
description: Run isolated review and fix agents on a SynthPlayground PR until in-scope actionable findings are resolved, retaining larger decisions for the user. User-invoked.
---

# Review until convergence

Accept `/code-review-until-convergence [PR] [additional instructions] [model]` or `$code-review-until-convergence` with the same arguments. Use [PR targeting/model selection](../code-review/references/pr-context.md) and the [code-review workflow and finding contract](../code-review/SKILL.md). Additional instructions augment or modify the normal review/fix scope.

The main agent orchestrates. **Reviewer and fixer are separate fresh subagents with no inherited conversation (`fork_turns="none"`).** Never have the implementer review its own fixes. Do not create separate user-owned tasks. If isolation or the selected model is unavailable, report the blocker instead of performing the roles in the main context.

## Set up

Resolve an open PR, confirm its head branch and repository, pin the original base/head and original PR scope/size, and identify the clean task checkout that will receive fixes. Preserve unrelated local edits. If the target differs from the current task, use an isolated checkout for that PR. Do not start a new PR or rewrite history for a follow-up review.

Keep a run ledger in the orchestrator context (or a temporary file outside tracked sources for a long run): finding ID/root cause, first/current SHA, priority, severity, evidence, disposition, attempted fix/check, and remaining decision. Allowed dispositions: actionable, fixed-pending-verification, fixed-and-verified, deferred-for-decision, disproved-with-evidence, or blocked. Track deferred items across every round; the absence of an item in a later review is not proof of resolution.

## Loop

1. **Review:** Run the complete `/code-review` procedure against the current candidate head in a detached review worktree. Give each new reviewer the neutral packet, rubric, user requirements, and full base-to-candidate diff, without the implementation conversation, previous verdicts, or fixer rationale. Local committed fixes may be ahead of the remote PR; name that candidate SHA explicitly. After its independent pass, ask it to verify earlier findings against current code so the ledger cannot silently lose unresolved items.
2. **Triage:** Merge findings by root cause and retain their priority/severity. An obvious win has a clear intended outcome, a bounded fix and validation path, fits the original PR purpose, and improves or preserves maintainability. Naming, deletion of verified dead code, a cohesive extraction, and a targeted regression fix can qualify. Do not reject architecture findings just because they are not runtime bugs.
3. **Defer decisions:** Accumulate findings whose proper remedy changes product behavior, public/persisted contracts, migration policy, architecture beyond the feature, or requires a significant expansion of the original PR. Compare substantive added/changed code and affected responsibilities with the **original** PR, not a growing denominator. There is no universal percentage cutoff: record an approximate size/share and the architectural reason; a ten-line fix in a tiny PR is not automatically excessive. Do not apply a brittle workaround merely to avoid a proper larger fix. Keep fixing independent obvious wins without interrupting for each deferred decision.
4. **Fix:** Dispatch a different no-history fixer with the pinned candidate SHA, absolute writable worktree path, selected actionable findings with evidence, original PR goal, user constraints, target `AGENTS.md`, and validation expectations. Give it a separate detached worktree at that SHA. It must inspect the code independently, implement only the selected in-scope fixes, add behavior-focused regression coverage where needed, and run the narrowest relevant checks. If a fix proves broad, ambiguous, or harmful to maintainability, return it as deferred with options instead of widening scope. The fixer returns commit SHAs, changed files, checks/results, and a disposition for **every** assigned finding; it never pushes or posts reviews.
5. **Integrate:** Wait for the fixer to finish. Confirm its commits descend from the pinned candidate, contain only authorized fixes, and pass their checks. Integrate into the clean target task branch by fast-forward (or a deliberate follow-up commit if necessary), preserving existing commits. If the target changed concurrently, inspect and reconcile before integrating; do not overwrite or force-push. The orchestrator owns integration and publication. Never run a reviewer against a moving fixer worktree.
6. **Repeat:** Review the entire updated PR in another fresh reviewer agent, including integration effects. Continue while there are actionable findings that can be addressed without human decisions. A fixed item requires evidence and independent verification; a successful fixer report alone is insufficient. A review that yields no new issues still must account for the ledger's deferred and blocked items.

## Progress and stopping

Do not stop after an arbitrary number of successful rounds. Do stop retrying an unchanged failed approach: if a finding recurs after an attempted fix, investigate the cause; if the same failure recurs without new evidence/progress or fixes oscillate, mark it blocked/deferred with the attempts and decision needed. Continue independent actionable work. Tool failure, exhausted resources, failed checks, and incomplete review coverage are blockers, not convergence.

Before handoff, perform the repository's cleanup and validation requirements, including `pnpm run validate` for code ready to land and the appropriate visual/audio review artifacts for UI/playback changes. If final validation requires edits, review those edits too. If validation is green, commit any remaining task changes and push follow-up commits to the same PR using normal non-force pushes; update its description when the final scope changed. Do not merge the PR. Recheck remote base/head for concurrent changes before publication and before claiming the published revision was reviewed; reconcile and re-review any changed code/base.

## Final report in the main conversation

Include PR link, actual reviewer/fixer models, original and final reviewed SHAs, rounds, a concise fixed-findings summary, commands/results, validation status, and UI/audio checks still needed.

- When the final complete review is clear **and** no ledger findings remain, say **“no review findings left”** with the reviewed revision and testing limits.
- Otherwise list **all remaining findings not addressable without a human decision**, with the code-review priority/severity/evidence, why deferred, smallest viable options, estimated scope/size, and the decision needed. Account explicitly for every ledger entry: summarize verified fixes and evidence-based dismissals, and individually list every still-actionable, fixed-pending-verification, deferred, or blocked finding with its priority/severity and current disposition. Include unresolved blockers and review gaps separately; a generic tool-failure note must not hide an unverified fix. Do not imply a clean review.

Keep all findings and decisions in this conversation. GitHub review comments are not part of this invocation unless the user separately requests publication.
