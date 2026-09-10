---
description: Execute feature's tasks from tasks.jsonl via parallel subagent delivery – orchestra orchestrator with up to 5 executors in worktrees, file watcher on .progress/*.json
agent: build
---

You are executing orchestra tasks for: $ARGUMENTS

$ARGUMENTS should be feature slug (kebab-case matching tasks' `feature` field). If empty, list features from tasks.jsonl and ask.

Follow `executing-tasks` skill exactly:

1. `skill` tool load `executing-tasks`
2. Git repo check: `bash ${ORCHESTRA_SCRIPTS}/check-git.sh` – if exit 1, ask user to init
3. Ensure isolated feature branch – normally already exists from breakdown; verify you are in it (`using-git-worktrees`), create only if resuming without it, clean baseline
4. Scope run:
   ```
   Feature: <feature>
   Tasks: N total — open/in_progress/closed/blocked
   Ready now: M tasks with no unmet deps
   Max agents: 5
   Watching: docs/mvp/.progress/*.json via file watcher
   ```
   Use `orchestra_tasks` tool action `list` with feature filter, or direct read
5. Ask ready to execute? [yes / show-dag / no] – show-dag via `orchestra_dag` tool
6. Launch `orchestra-orchestrator` agent with:
   - Integration worktree path: absolute `git rev-parse --show-toplevel`
   - Task file: absolute `<artifacts_dir>/tasks.jsonl`
   - Feature name
   - Model map from `.opencode/orchestra.local.md` or `.claude/mvp.local.md` fallback, else defaults low:haiku medium:sonnet high:inherit
   - Directive: "Begin execution immediately. Assign all initially-ready tasks in parallel. Maximize throughput. Watch .progress/*.json"
   Spawns `orchestra-task-executor` per task in isolated worktree via `task` tool (explicit `git worktree add` before spawn), merges via `merge-worktree.sh <wt> <branch> <integration>`, conflicts to `orchestra-merge-resolver`, appends discovered tasks
7. While orchestrator runs, relay one-line status updates. File watcher logs `.progress/*.json` changes automatically.
8. On completion: verify merges landed on feature branch (`git log --oneline -n <count>`), run full test suite via `bash ${ORCHESTRA_SCRIPTS}/ctx-test.sh` – report only counts you saw, then invoke `finishing-a-development-branch`
9. Resuming: tasks.jsonl durable state. Reset stale `in_progress` → `open` before launch

Shared protocol: STATUS block + .progress files are harness-agnostic, so Claude can resume same tasks.jsonl.

Feature arg: $1
Full: $ARGUMENTS
