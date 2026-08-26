---
description: Convert approved spec into DAG tasks in tasks.jsonl – minimal scope, verifiable success criteria, dependencies, resources
agent: build
---

You are running orchestra task breakdown for: $ARGUMENTS

$ARGUMENTS should be path to spec file or feature name. If empty, look for latest spec in `docs/mvp/specs/` or `docs/orchestra/specs/` or ask user.

Follow `task-breakdown` skill exactly:

1. `skill` tool load `task-breakdown`
2. Resolve artifacts_dir via `configuring-orchestra` (default `docs/mvp`), ensure isolated worktree via `using-git-worktrees` BEFORE breakdown to avoid tasks.jsonl append collisions
3. Parse spec, create minimal-scope tasks (one file/endpoint/migration, <100 lines, verifiable `success_criteria`), assign `complexity`, `dependencies`, `resources`
4. Use `orchestra_tasks` tool action `append` or direct file write to append to `<artifacts_dir>/tasks.jsonl` with file-wide sequential IDs T001...
5. On concurrent breakdowns, expect ID collision – keep both, renumber later via `renumber-tasks.py` or `orchestra_tasks` tool handles sequential alloc
6. Display DAG via `orchestra_dag` tool or `python3 ${ORCHESTRA_SCRIPTS}/display-dag.py <artifacts_dir>/tasks.jsonl`
7. Confirm with user, then invoke `executing-tasks`

Shared protocol: tasks.jsonl append-only, IDs T001... never per-feature reset, cross-harness compatible.

If spec file provided as $1, use first arg: $1
Full args: $ARGUMENTS
