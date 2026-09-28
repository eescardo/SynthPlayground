---
name: code-review
description: Review a SynthPlayground PR with fresh independent reviewers and report findings with separate priority and severity. User-invoked; read-only.
---

# Code review

Accept `/code-review [PR] [additional instructions] [model]`, `$code-review`, or an explicit request to use this skill. Follow [PR targeting and model selection](references/pr-context.md). Carry additional instructions verbatim to the reviewer.

## Orchestrator

1. Resolve the PR and pin its repository, base, merge base, and reviewed head. Use the published head for open PRs, the landed result for merged PRs, or the explicit local candidate supplied by convergence. Record the observed remote base/head separately. State the target/model and disclose excluded local edits or unpublished commits.
2. Create a detached temporary review worktree or immutable snapshot. Read the target revision's `AGENTS.md`; keep test outputs outside the implementation checkout. Do not apply the implementation commit/PR delivery contract to a read-only review.
3. Use fresh reviewer subagents with no inherited conversation: `spawn_agent`, `fork_turns="none"`, resolved model. For substantial changes, use two reviewers with distinct lenses: behavior/contracts/state and architecture/integration/testing. A change is substantial when it spans subsystems, changes shared abstractions, or affects lifecycle, persistence, runtime, or broad interaction flows. For narrow changes, one reviewer may cover both lenses. Do not reuse an implementation/fixer agent or create a user-owned task. Report a blocker if isolated delegation is unavailable.
4. Send each reviewer the initial packet below and gather its independent findings. Then provide the reconciliation packet and ask it to revise its findings if the added evidence changes them.
5. Verify locations, deduplicate root causes, and present findings in the main conversation. Preserve distinct architecture, maintainability, readability, and polish findings, including large fixes. Resolve factual disputes with evidence or a reviewer recheck; disclose unresolved disagreements.
6. Compare remote base/head with the observed values at dispatch. If they changed unexpectedly, review the reconciled snapshot or label the result stale. Report the reviewed SHA, actual model, checks run, and coverage gaps. Do not edit code or post GitHub comments unless separately requested.

## Initial reviewer packet

Pass:

- Role: read-only reviewer; return findings to the orchestrator without recursively invoking this skill, editing, committing, pushing, or commenting.
- Assigned review lens, PR URL/title, repository, base/merge-base/reviewed head SHAs, observed remote base/head, candidate/publication status, and absolute review-worktree path.
- Target `AGENTS.md`, [review rubric](references/review-rubric.md), and finding contract below.
- User requirements, additional instructions, available checks, and access constraints.

Do not provide implementation history, implementation reasoning, prior reviews, convergence claims, suspected findings, proposed fixes, or PR discussion before the independent pass.

Require the reviewer to read the rubric, complete aggregate diff, affected modules/callers, and relevant tests. Trace implicated UI, state, persistence, scheduling, worklet, and Rust boundaries. Report incomplete coverage explicitly.

## Reconciliation packet

After the independent pass, provide the PR body, relevant discussion, prior findings, implementation claims, and CI/capture results. Require the reviewer to verify this evidence against the code, recheck conflicts, and return a final findings list.

## Findings

Return each distinct finding with:

- **Stable ID, title, priority, severity, category, and confidence.**
- **Location:** path, narrow line span, symbol, reviewed SHA, and verified link. Anchor in changed code and mark pre-existing/out-of-scope issues.
- **Evidence/consequence:** concrete trigger or maintenance scenario, resulting problem, and reproduction/test evidence. Distinguish observed, tested, and inferred behavior.
- **Remedy:** smallest coherent fix, targeted verification, and any decision needed. Explain the benefit of proposed extractions or tests.

Assign priority by urgency:

| Priority | Meaning                                                     |
| -------- | ----------------------------------------------------------- |
| P0       | Immediate, broadly applicable landing/release blocker.      |
| P1       | Fix before landing: material risk or central design defect. |
| P2       | Worth fixing: bounded correctness or maintenance cost.      |
| P3       | Optional readability or polish improvement.                 |

Assign severity by the worst supported consequence:

| Severity | Meaning                                                                  |
| -------- | ------------------------------------------------------------------------ |
| S0       | Data loss or corruption.                                                 |
| S1       | Crash, hang, or unusable app/audio runtime.                              |
| S2       | Incorrect behavior, broken contract, or concrete maintainability burden. |
| S3       | Material readability problem.                                            |
| S4       | Minor consistency or presentation issue.                                 |

Keep priority independent of severity; use reachability and likelihood to justify urgency. Order findings by priority, then severity. Format titles as `[P2][S3] Clarify timeline coordinate units`.

Present findings first and distinguish optional improvements from blockers. After every required lens completes with no findings, say **“no review findings left”** with the reviewed SHA and testing limits. Report incomplete reviews without an all-clear.
