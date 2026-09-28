---
name: loop-review-fix
description: Review and fix a SynthPlayground PR until convergence using isolated agents; resolve in-scope findings and retain larger decisions for the user. User-invoked.
---

# Loop: Review until convergence

Accept `/loop-review-fix [PR] [additional instructions] [model]` or `$loop-review-fix`. Follow [PR targeting/model selection](../code-review/references/pr-context.md) and the [code-review workflow](../code-review/SKILL.md). Apply additional instructions to the review/fix scope.

**Use separate fresh reviewer and fixer subagent contexts with `fork_turns="none"`.** Use every reviewer required by the code-review workflow. The fixer may share the orchestrator's task checkout. Keep orchestration in the main agent. Do not create user-owned tasks or perform either role in the main context if delegation is unavailable.

## Set up

Resolve an open, editable PR. Pin its original base/head and scope/size. Reuse the orchestrator's checkout when it is on the target PR branch; confirm HEAD matches the candidate and record pre-existing edits. Use another checkout only when the current one belongs to a different PR or cannot safely accommodate the fixes. Preserve unrelated edits and existing commits. Allow only one writer in the fix checkout at a time; the orchestrator must not edit while the fixer works.

Track findings in the orchestrator context or a temporary file outside tracked sources. Record ID/root cause, first/current SHA, priority/severity, evidence, attempted fixes/checks, decision needed, and status: actionable, fixed-pending-verification, fixed-and-verified, deferred-for-decision, disproved-with-evidence, or blocked. Retain unresolved findings across rounds.

## Loop

1. **Review:** Run `/code-review` against the pinned candidate in a detached review worktree. Give each fresh reviewer its assigned lens, neutral initial packet, and full diff. Withhold earlier verdicts, implementation history, convergence claims, and fixer rationale until each reviewer completes an independent pass. Then ask the reviewers to verify prior findings and added evidence against the current code.
2. **Triage:** Deduplicate root causes. Select fixes with a clear outcome, bounded implementation/validation, and a maintainability benefit within the original PR scope. Include useful naming, cleanup, extraction, and correctness fixes.
3. **Defer:** Retain findings requiring product decisions, contract/migration changes beyond the PR's intent, broad architecture work, or significant scope/size expansion. Record options, approximate size/share relative to the original PR, and the decision needed. Use judgment rather than a fixed percentage cutoff. Avoid brittle workarounds and continue independent fixes without asking about every deferred item.
4. **Fix:** Give a different fresh agent the selected task checkout path and candidate SHA, selected findings, original PR goal, user constraints, target `AGENTS.md`, and validation expectations. Do not create an additional fixer worktree when the existing checkout is suitable. Require independent inspection, scoped fixes, relevant regression tests, and narrow checks. Return broader or ambiguous fixes as deferred. Commit only assigned changes; preserve pre-existing edits. Return commits, changed files, check results, and a status for every assigned finding. The fixer must not push or post reviews.
5. **Verify:** Wait for the fixer to finish. Verify its commits descend from the candidate, stay in scope, and pass checks. When it used the task checkout, the fixes are already on the target branch; no merge is needed. Only integrate commits when a separate fix checkout was necessary. Reconcile unexpected changes without overwriting or force-pushing. Keep reviewers on their pinned snapshots.
6. **Repeat:** Review the entire updated PR in another fresh agent. Independently verify fixes and keep looping while actionable findings remain. Do not mark an omitted finding resolved or treat a fixer report alone as verification.

## Stop and deliver

- Continue successful rounds without an arbitrary iteration limit. Investigate recurring findings; if attempts repeat without progress or oscillate, record a blocker/decision and continue independent work.
- Report tool failures, failed checks, exhausted resources, and incomplete coverage as blockers, not convergence.
- Complete repository cleanup and `pnpm run validate`, plus required UI/audio evidence. Re-review any edits made during validation.
- With validation green, publish follow-up commits to the same PR using non-force pushes and update its description as needed. Do not merge. Reconcile and re-review unexpected remote/base changes; verify the published head matches the reviewed candidate.

## Main-conversation report

Include PR link, actual reviewer/fixer models, original/final reviewed SHAs, rounds, fixed-findings summary, commands/results, validation status, and outstanding UI/audio checks.

Say **“no review findings left”** only after every required review lens completes and no unresolved findings remain. Otherwise list every actionable, unverified, deferred, or blocked finding with priority, severity, evidence, and status. For human decisions, include why deferred, viable options, estimated scope/size, and the decision needed. Summarize verified fixes and evidence-based dismissals; report coverage gaps separately.

Do not post GitHub review comments unless separately requested.
