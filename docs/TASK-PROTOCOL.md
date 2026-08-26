# Orchestra Task Protocol – Shared Across Harnesses

This document defines the shared protocol so tasks in `docs/mvp/tasks.jsonl` can be picked up by any harness: Claude Code, OpenCode (orchestra), Pi, Codex, Gemini, etc.

## File Format

- **Path:** `docs/mvp/tasks.jsonl` by default (configurable via `.opencode/orchestra.local.md` `artifacts_dir`, fallback `.claude/mvp.local.md`)
- **Encoding:** UTF-8, JSON Lines – one JSON object per line, no trailing commas, no comments
- **Append-only:** Across features, file grows. Never rewrite whole file except for status updates (open→in_progress→closed). Never reset IDs per feature.
- **Durable state:** Resume point – re-invoke `executing-tasks` with feature slug picks up non-closed tasks

## Schema (stable)

```json
{
  "id": "T001",
  "feature": "user-auth-jwt",
  "goal": "Add POST /api/users endpoint",
  "success_criteria": "pytest tests/test_users.py::test_post_users passes",
  "status": "open|in_progress|closed|blocked",
  "complexity": "low|medium|high (default medium)",
  "dependencies": ["T001", "T002"],
  "resources": ["src/api/users.py", "docs/mvp/specs/2026-08-26-auth-design.md#API", "https://example.com"]
}
```

- `id`: `T` + zero-padded 3 digits `T001..T999` (future `T1000` allowed but spec says 3 today). **File-wide sequential**, never per-feature.
- `feature`: kebab-case slug grouping tasks – orchestrator scopes run to one feature
- `goal`: single imperative sentence
- `success_criteria`: verifiable – specific test command, file existence, API response, build exit. Must be runnable.
- `status`: `open` → `in_progress` (orchestrator on assignment) → `closed` (after merge) or `blocked`
- `complexity`: `low` = mechanical 1-2 files → fast model, `medium` = standard, `high` = novel coordination → inherit/session model. Configurable map.
- `dependencies`: array of IDs, only when output literally needed. No cycles. Cross-feature allowed only if target `closed`, else dependent marked `blocked`.
- `resources`: file paths, spec anchors `#Section`, URLs, dirs – everything executor needs.

**Validation:** `python3 -c "import json,sys; [json.loads(l) for l in open('docs/mvp/tasks.jsonl') if l.strip()]"`

## Status Lifecycle

- `open`: ready or blocked by deps
- `in_progress`: assigned to executor, worktree created, progress file `.progress/T*.json` created
- `closed`: merged into integration branch via `merge-worktree.sh`
- `blocked`: failed dep, unresolved merge, unresponsive agent

Executor also sets local copy `status: closed` before commit in its worktree.

## Ready Calculation

Task is ready when:
- `status == open`
- Every `dependencies` task has `status == closed` in tasks.jsonl
- Current `in_progress` count < 5

## New Tasks Discovered by Executors

Executor may discover gaps. It signals via `new_tasks` array of **partial tasks** (no id/status):

```json
{
  "goal": "Add rate limiting to POST /api/users",
  "success_criteria": "pytest tests/test_rate_limit.py passes",
  "dependencies": ["T001"],
  "resources": ["src/api/users.py"]
}
```

Orchestrator appends with sequential IDs `max(existing)+1`, `status: open`, same `feature` field.

## ID Collision Handling (Critical for Shared Protocol)

Concurrent breakdowns may claim same range. Example: two sessions both see last ID T010, both start at T011.

**Rule:** Append-append conflict is mechanical keep-both. On merge conflict in `tasks.jsonl`, renumber incoming branch's tasks to continue file-wide sequence and update that feature's internal dependency refs. Never renumber already-merged lines.

Implementation: `renumber-tasks.py` + `merge-resolver` special case.

```bash
# Check
python3 src/scripts/renumber-tasks.py docs/mvp/tasks.jsonl --check
# Fix in place
python3 src/scripts/renumber-tasks.py docs/mvp/tasks.jsonl --fix
# Merge two files
python3 src/scripts/renumber-tasks.py docs/mvp/tasks.jsonl --second-file incoming/tasks.jsonl --output merged.jsonl
```

If duplicate IDs exist, last wins in `display-dag.py` dict – warning only. Renumber fixes.

## Completion Signal (Harness-Agnostic, Load-Bearing Field Names)

Every executor MUST emit final message exactly this shape, nothing more – regardless of whether `TaskUpdate` exists. Orchestrator parses when `TaskUpdate` unavailable (OpenCode, Pi, Codex).

```
STATUS: completed | stuck
WORKTREE_PATH: <absolute path to your worktree>
BRANCH_NAME: <your git branch name>
VERIFICATION: <the command you ran and the summary line you actually saw>
NEW_TASKS: <JSON array of follow-up tasks, or []>
NOTES: <omit unless orchestrator must act>
```

- `NOTES` ≤2 sentences, only for orchestrator decision (deviation, files touched that parallel tasks also touch). On `stuck`, carries what tried, what failed, decision needed.
- Everything else stays out – no goal restatement, no process narration, no diffs. Detail lives in commit, tasks.jsonl, worktree.

This block is injected verbatim into orchestrator context and re-read every turn – detail here is paid many times, detail on disk paid only if looked up.

## Progress Files (Orchestra-Specific Additive, File Watcher Friendly)

- **Path:** `<artifacts_dir>/.progress/T001.json` (default `docs/mvp/.progress/`), also `.mvp/progress/` compat fallback. Gitignored, live state.
- **One file per task** – no contention, executor owns its file.
- **Schema:**
```json
{
  "id": "T003",
  "feature": "user-auth-jwt",
  "status": "in_progress|completed|stuck|blocked",
  "harness": "opencode|claude|pi|codex|gemini",
  "executor_model": "sonnet",
  "worktree_path": "/abs/path",
  "branch_name": "orchestra/T003-...",
  "started_at": "ISO",
  "updated_at": "ISO",
  "progress_log": ["read resources", "wrote failing test"],
  "verification": "pytest tests/... 3 passed",
  "stuck_message": null,
  "new_tasks": [],
  "notes": null,
  "resume_guidance": null
}
```

- **Executor duties (dual-write, additive):** On startup create file `in_progress`. After each meaningful unit append to `progress_log` and update `updated_at`. On stuck write `stuck_message`. On completion final `completed` + `verification` + `new_tasks`. Always emit STATUS block still.
- **Orchestrator polling:** Glob `.progress/*.json`, read `updated_at`, rebuild `in_progress` set, detect stuck. If Claude Tasks available (Claude Code), treat files as secondary; if not (OpenCode), files become primary. This does not break Claude flow because Claude path unchanged – file write is extra.
- **File watcher:** OpenCode `file.watcher.updated` event watches `tasks.jsonl` + `.progress/*.json`, debounced 750ms, logs via `client.app.log`, skips own writes via `Map<file,timestamp>`. Main session can tail progress without touching `tasks.jsonl` (avoids merge conflicts).

## Worktree Integration Path (Mandatory 3rd Arg)

`merge-worktree.sh` requires 3rd arg `integration_path` – never rely on cwd. Your shell may start in main repo on default branch – cwd-relative merge silently lands task work on wrong branch.

```
bash ${ORCHESTRA_SCRIPTS}/merge-worktree.sh <worktree_path> <branch_name> <integration_path>
# Exit 0 MERGED:<branch> INTO:<branch>@<path>
# Exit 2 CONFLICT:files
# Exit 1 not a conflict (dirty, missing, bad path)
```

Orchestrator always passes absolute integration path from prompt.

## Verification (Evidence Before Assertions)

Every executor must verify success criteria explicitly before committing – run named test (`pytest`, `npm test`), call endpoint, check file exists, run build, whatever criteria specifies. Do not skip. This is `verification-before-completion`.

## Versioning

`task-schema.md` is source of truth. Optional `protocol_version` field could be added later if breaking change, but currently keep format stable, add `harness` field only in progress files, not tasks.jsonl.

## Compatibility Matrix

- **Claude Code `mvp`**: reads tasks.jsonl, uses TaskCreate/Update/List, emits STATUS block fallback, merge-resolver handles tasks.jsonl special case – compatible, shares same file if orchestra also writes.
- **OpenCode orchestra**: reads tasks.jsonl, writes `.progress/*.json` + STATUS block, orchestrator polls progress files, file watcher syncs, uses `orchestra_tasks` tool for safe append – compatible, file writes additive.
- **Pi/Codex/Gemini**: ignore Task* tools, parse STATUS block + progress JSON – compatible, since STATUS block is primary.

## Tools

- `orchestra_tasks` – safe read/append/update/list/validate with sequential ID alloc
- `orchestra_dag` – display-dag.py wrapper + JS fallback icons ○◉✓✗
- `renumber-tasks.py` – check/fix/merge two files
- `display-dag.py` – topological levels
- `merge-worktree.sh` – merge with mandatory integration path
- `ctx-*.sh` – token optimization scripts (git state, read outline, grep capped, test one-liner)
