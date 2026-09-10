---
name: task-breakdown
description: Use when a brainstormed spec has been approved and needs to become executable work - converts the spec into small verifiable tasks appended to the project's growing tasks.jsonl, ready for parallel subagent delivery
---

# Task Breakdown

Convert an approved spec into a DAG of small, independently executable tasks, appended to the project's **growing task file**: `<artifacts_dir>/tasks.jsonl` (default `docs/mvp/tasks.jsonl`).

**Announce at start:** "I'm using the task-breakdown skill to convert the spec into tasks."

This replaces document-style implementation plans as the default flow. The task file is the plan — it grows feature by feature and is the single source of truth for what has been built and what remains. (For rare deep-design work where a prose plan genuinely helps, `mvp:writing-plans` still exists as the fallback.)

## Precondition: Work in an Isolated Worktree

**REQUIRED SUB-SKILL:** `mvp:using-git-worktrees` — enter (or verify) an isolated worktree on this feature's branch **before appending any tasks**. The task file is shared, growing state: two sessions generating tasks in the same checkout would interleave appends and collide on IDs. In a worktree, each session appends to its own copy, and git reconciles at merge time.

**Merge rule for concurrent breakdowns:** because the file is append-only, two branches appending different features conflict at end-of-file when they merge. Resolution is mechanical: keep both features' lines, and if IDs collide (both continued from the same last line), renumber the later-merging feature's tasks to continue the sequence — updating that feature's internal `dependencies` references to the renumbered IDs. Never renumber the already-merged feature.

## Inputs

- **Artifacts dir:** resolve `<artifacts_dir>` via mvp:configuring-mvp (reads `.claude/mvp.local.md`; default `docs/mvp`; runs the one-time setup ask if no config exists). All paths below derive from it.
- **Spec file:** the approved design from brainstorming, at `<artifacts_dir>/specs/YYYY-MM-DD-<topic>-design.md`
- **Feature name:** kebab-case slug derived from the spec topic (e.g. `user-authentication-jwt`). This becomes each task's `feature` field.
- **Task file:** `<artifacts_dir>/tasks.jsonl` — create it if this is the project's first feature; otherwise append.

## Task Design Principles

Each task must satisfy ALL of the following:

**Minimal scope.** One coherent unit of work — one file, one endpoint, one component, one migration. Multi-file changes only when tightly coupled and the total diff is small (rough guide: under ~100 lines). When in doubt, split.

**Verifiable completion criteria.** Checkable without human judgment. Good: "Running `pytest tests/test_auth.py::test_login` passes." Bad: "The login flow works correctly." Name the specific test, command, file, or API response.

**Maximum independence.** If two tasks can be done in any order, they have no dependency between them. B depends on A only if B literally cannot start without A's output existing.

**Self-contained resources.** Every task lists all files, docs, and context a subagent needs to deliver it without asking clarifying questions. Always include the spec file (or the relevant section anchor).

**Honest complexity.** Rate each task so the right model executes it (least powerful that can handle it — cost and speed):
- `low` — mechanical: isolated function, clear pattern to copy, 1–2 files, criteria trivially checkable (add a field, boilerplate endpoint mirroring an existing one).
- `medium` — standard feature work: a few files, some design freedom within the spec. **The default when unsure.**
- `high` — novel logic, multi-file coordination, subtle state/concurrency, anything where a wrong approach is expensive to unwind.

A well-specified plan makes most tasks `low` — if everything rates `high`, the tasks are too big; split them.

## Task Schema

One JSON object per line. See `references/task-schema.md` for full field documentation.

```json
{
  "id": "T014",
  "feature": "user-authentication-jwt",
  "goal": "Add POST /api/login endpoint that returns a signed JWT",
  "success_criteria": "pytest tests/api/test_login.py::test_login_returns_jwt passes",
  "status": "open",
  "complexity": "medium",
  "dependencies": ["T012"],
  "resources": ["src/api/auth/", "docs/mvp/specs/2026-08-24-user-auth-design.md#Proposed-Approach"]
}
```

- **IDs are file-wide and sequential** (T001, T002, …). New features continue the sequence from the last line visible in this worktree — never restart at T001. (A concurrent session may claim the same range on its own branch; the merge rule above renumbers on conflict.)
- **Status values:** `open`, `in_progress`, `closed`, `blocked`
- **Complexity** (`low` / `medium` / `high`, default `medium`) sets which model executes the task — see below.
- **Cross-feature dependencies** are allowed only on tasks that are already `closed`.

## Decomposition Process

1. Read the spec's proposed approach. Identify the major work areas.
2. For each area, find the smallest units that can be independently completed and verified.
3. For each unit, ask: "Could a subagent deliver this armed only with the listed resources?" If no — add resources or split.
4. Assign dependencies conservatively: only where the downstream task literally needs the upstream output.
5. Review the DAG: shrink tasks that block many others; ensure at least 2 zero-dependency tasks (parallel start points); every task names a concrete verification.
6. **Append** the tasks to `<artifacts_dir>/tasks.jsonl` — never rewrite or reorder existing lines; prior features' tasks are the project's history.
7. Display the DAG and get confirmation:

```
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/display-dag.py <artifacts_dir>/tasks.jsonl
```

Ask: "Does this task breakdown look right? [yes / edit / no]"
- **yes** → invoke `mvp:executing-tasks` to deliver them
- **edit** → add/remove/split/merge tasks directly in the file, re-display, ask again
- **no** → ask what's wrong, redo the breakdown for this feature (remove only this feature's lines)

## Quality Check Before Finishing

- [ ] Every task's goal is a single concrete imperative sentence
- [ ] Every completion criterion names a specific test, command, file, or API assertion
- [ ] Every task carries the correct `feature` slug
- [ ] Complexity is rated honestly (mechanical → `low`; default `medium`; only genuinely hard tasks `high`)
- [ ] Dependencies are minimal; no cycles; cross-feature deps only on `closed` tasks
- [ ] Resources include the spec file and every file the executor will touch
- [ ] IDs continue the file-wide sequence; existing lines untouched
- [ ] The file is valid JSONL (`python3 -c "import json,sys; [json.loads(l) for l in open('<artifacts_dir>/tasks.jsonl') if l.strip()]"`)

## Additional Resources

- **`references/task-schema.md`** — full field documentation and examples
