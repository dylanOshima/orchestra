---
name: executing-tasks
description: Use when a feature's tasks exist in docs/mvp/tasks.jsonl and are ready to deliver, or when resuming a partially delivered feature - launches the orchestrator to drive parallel subagent execution of the task DAG
---

# Executing Tasks

Deliver a feature by driving its task DAG in the configured task file (`<artifacts_dir>/tasks.jsonl`, default `docs/mvp/tasks.jsonl` — resolve via mvp:configuring-mvp) to completion with parallel subagents. This is mvp's implementation engine (adopted from pool-party), replacing document-plan execution as the default flow.

**Announce at start:** "I'm using the executing-tasks skill to deliver the feature's tasks."

## Step 1: Git Repository Check

```
bash ${CLAUDE_PLUGIN_ROOT}/scripts/check-git.sh
```

Exit 0 → continue. Exit 1 → ask your human partner: "Task execution needs a git repository to manage parallel worktrees. Initialize one here with `git init`? [yes / no]". On no, stop.

## Step 2: Ensure an Isolated Feature Branch

The worktree normally already exists — task-breakdown created it before appending tasks, and this feature's tasks.jsonl lines live on its branch. Verify you are in it (`mvp:using-git-worktrees`; create one now only if resuming a feature without it) with a clean test baseline — the orchestrator merges each task's worktree branch back into the branch it was launched from, so never run from `main` directly.

## Step 3: Scope the Run

Identify the feature (kebab-case slug matching the tasks' `feature` field — from the just-completed breakdown, or ask if ambiguous). Then count that feature's tasks by status and present:

```
──────────────────────────────────────────
  Feature   : <feature>
  Tasks     : <N> total — <open> open, <in_progress> in progress, <closed> closed, <blocked> blocked
  Ready now : <M> tasks with no unmet dependencies
  Max agents: 5
──────────────────────────────────────────

Ready to execute — proceed? [yes / show-dag / no]
```

- **show-dag** → `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/display-dag.py <artifacts_dir>/tasks.jsonl`, then ask again
- **no** → stop; the run can be resumed any time by re-invoking this skill
- **yes** → Step 4

If every task for the feature is already `closed`, say so and skip to Step 5.

## Step 4: Launch the Orchestrator

Spawn the `mvp:orchestrator` agent with:
- Integration worktree path: the **absolute path** of the worktree you are in (`git rev-parse --show-toplevel`). The orchestrator passes this to every merge so task branches land on this feature's branch and never on the caller's default cwd
- Task file path: the resolved `<artifacts_dir>/tasks.jsonl` as an **absolute path** (agents never read the config themselves)
- Feature name: `<feature>`
- Model map: from the `models` key in `.claude/mvp.local.md` if present, else the defaults `low: haiku, medium: sonnet, high: inherit` — the orchestrator picks each executor's model from its task's `complexity` and escalates one tier on retry
- Directive: "Begin execution immediately. Assign all initially-ready tasks in parallel. Maximize throughput."

The orchestrator spawns one `mvp:task-executor` per task in an isolated worktree (executors follow `mvp:test-driven-development` and `mvp:verification-before-completion`), merges completed branches (conflicts go to `mvp:merge-resolver`), appends newly discovered tasks to tasks.jsonl under this feature, and surfaces stuck agents.

While it runs, relay its one-line status updates. Do not second-guess merged work — task completion criteria were verified by the executors.

## Step 5: Finish the Branch

When the orchestrator reports all of the feature's tasks `closed`:

1. Confirm the merges landed where they should: `git log --oneline -n <task count>` in this worktree should show the task merge commits on **this feature's branch**, and the default branch should be untouched. A merge that ran from the wrong directory shows up here.
2. Run the full test suite on the merged result — a green run here is the real completion signal (`mvp:verification-before-completion`). Report only counts you read from this run's output, and name the command that produced them; never quote figures from an earlier run or from expectation.
3. **REQUIRED SUB-SKILL:** invoke `mvp:finishing-a-development-branch` to integrate the feature (merge / PR / keep / discard) and clean up.
4. If the feature shipped or changed web UI, you may **suggest** (one sentence, never run unprompted): "This added new UI — want a bug bash (`mvp:bug-bash`) before moving on?"

## Resuming

The configured `<artifacts_dir>/tasks.jsonl` is the durable state. To resume an interrupted feature, re-invoke this skill with the feature name — the orchestrator picks up every non-`closed` task. Reset any stale `in_progress` tasks (from a crashed run) back to `open` before launching.
