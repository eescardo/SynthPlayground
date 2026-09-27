# Resolve invocation, PR, and model

Resolve arguments before reviewing or editing.

## Invocation

`/code-review [PR] [additional instructions] [model]` and `/code-review-until-convergence [PR] [additional instructions] [model]` accept a PR number (`104` or `#104`), PR URL, exact branch, unique PR title, or clear contextual reference such as “the PR we just opened.” `/pr-digest [PR] [additional instructions] [model]` accepts the same targeting and optional model syntax.

Bracketed fields are optional placeholders, not literal syntax. Quoted free text and explicit `PR=`, `instructions=`, and `model=` are useful when positional meaning is unclear. Do not mistake numbers inside instructions for PR numbers or consume arbitrary trailing prose as a model. Examples:

- `/code-review` — PR created in this conversation.
- `/code-review #104 "Focus on undo and keyboard behavior" model=gpt-5.6-sol`
- `/code-review-until-convergence "the pan PR" "Preserve clipboard compatibility"`
- `/pr-digest https://github.com/eescardo/SynthPlayground/pull/99`

The slash form is a user-message convention routed by this repo's `AGENTS.md`, not a registered built-in slash command. Native skill selection uses `$code-review`, `$code-review-until-convergence`, or `$pr-digest` (or the host skill picker). Prefer the repo-local skill if a personal review skill also exists; do not edit or remove the personal skill.

## Target resolution

1. Honor an explicit identifier and verify repository identity against the Git remote. A URL that clearly names another repository is explicit targeting, not permission to edit this checkout as if it were that repository.
2. With no PR argument, use the PR created or unambiguously selected in **this conversation**. The newest repo PR or another active task is not an acceptable guess.
3. If conversation evidence is absent, inspect the current task branch and its associated open PR as a candidate. Read-only discovery can use `gh repo view --json nameWithOwner`, `git status --short --branch`, `gh pr view <candidate> --json number,url,title,state,body,baseRefName,baseRefOid,headRefName,headRefOid`, and `gh pr list --state open --json number,title,headRefName,url`. Paginate if needed; avoid silently truncated results.
4. If multiple plausible active PRs remain, present their numbers, exact titles, and branches and ask the user to choose. If there is no candidate, ask for an identifier. Do not make branch changes while ambiguous. Do not create a PR solely to satisfy a review request.
5. Fetch the selected base/head explicitly and record `git merge-base <base-sha> <head-sha>`. Read the full diff `git diff <merge-base> <head-sha>` and compare metadata to the fetched objects. For fork PRs, fetch the PR ref from the base repository rather than assuming `origin/<branch>` exists.

Use the selected PR's real base, even for stacked PRs. For merged PRs, default to reviewing/digesting the **landed result**, not a potentially reused branch head. Inspect the final branch head only when explicitly requested. Reconstruct the merge-time base and landed change from GitHub metadata/merge parents; do not compare against today's advanced base and accidentally produce an empty diff. State whether reviewing the final branch head or the landed result. Closed unmerged PRs have a head, but no landed version. If a historical base cannot be established, state the limitation rather than guessing.

Review and digest may inspect closed/merged PRs. Convergence requires an open PR with an editable head branch; for a closed/merged PR, report that condition and ask whether the user wants a new follow-up task before changing branches.

## Model selection

Default to **`gpt-5.6-sol`** for review. Check the running host's advertised model IDs and aliases before delegation. Do not invent a model ID or silently inherit the orchestrator's model. If the requested/default model is unavailable, offer available choices and wait for a selection before dispatch. Honor a user-confirmed mapping for the rest of that invocation.

An explicit `model=` overrides the default. Record the actual model used in the result. The convergence model applies to both reviewer and fixer unless the user names separate models. Digest uses the named model through a fresh subagent when specified; otherwise it may run in the main agent without changing models.

## Candidate and remote revisions

Ordinary review/digest targets the published head for an open PR and the landed result for a merged PR. Convergence may explicitly supply a committed local candidate descended from the selected PR head. Record two independent snapshots: **reviewed base/merge-base/candidate head** and **observed remote base/head at dispatch**. Read and test the candidate; check remote movement against the observed remote snapshot. A known local candidate being ahead of its unchanged remote is expected, not staleness. An unexpected remote/base change requires reconciliation and a fresh review before claiming convergence. A planned push of the already-reviewed candidate is publication, not a new code change. After pushing, verify the remote head equals that reviewed candidate and the base is still the reviewed base.

## Snapshot isolation

Give reviewers a detached temporary worktree or immutable source snapshot and a fresh agent context. A fixer may use the orchestrator's existing task checkout in its own fresh agent context; allow only one writer there at a time. Pin all reads to the selected revision and do not switch/reset the user's working directory to review another PR. Never discard, stash, or commit unrelated local changes automatically. Clean up only the temporary artifacts/worktrees created by this invocation, after their results or fixes are secured.
