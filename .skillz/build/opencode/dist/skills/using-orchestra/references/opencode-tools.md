# OpenCode Tools Mapping – Orchestra (OpenCode-native)

Orchestra is optimized for OpenCode. This reference explains how to map skill actions (written in harness-agnostic language) to OpenCode's native tools and how its unique capabilities (file watcher, compaction, custom tools, shared task protocol) work.

## Core Tool Mapping

| Skill says | OpenCode does | Notes |
|------------|---------------|-------|
| Create or update todos | `todowrite` | Also sync to `.progress/*.json` via file watcher; tasks.jsonl remains source of truth |
| Dispatch subagent / Agent({subagent_type}) | `task` tool | Use `subagent_type: "general"` for generic, `subagent_type: "explore"` for read-only exploration, or orchestra-specific: `orchestra-task-executor`, `orchestra-orchestrator`, `orchestra-merge-resolver` |
| Invoke a skill | `skill` tool | Bare names: `skill({name:"brainstorming"})`, NOT `mvp:brainstorming`. Alias `using-mvp` still works via compat, but prefer `using-orchestra` |
| Read a file | `read` | |
| Create/edit/delete file | `apply_patch` | |
| Run shell command | `bash` | Env vars: `ORCHESTRA_PLUGIN_ROOT`, `ORCHESTRA_SCRIPTS`, `ORCHESTRA_SKILLS`, `ORCHESTRA_AGENTS` + compat `CLAUDE_PLUGIN_ROOT` alias set via `shell.env` hook |
| Search file contents / find files | `grep`, `glob` | |
| Fetch URL | `webfetch` | |
| Task management | `orchestra_tasks` custom tool | `action: read|append|update-status|list|validate`, `artifacts_dir`, `feature`, `task_json` |
| DAG display | `orchestra_dag` custom tool | Wrapper for `display-dag.py` + JS fallback |
| Progress tracking | File watcher + `.progress/*.json` | See below |

## File Watcher – Live Progress Sync

OpenCode has unique `file.watcher.updated` event (OS-level chokidar) + `file.edited` (AI's own edits) + `todo.updated`.

Orchestra plugin uses this to:
- Watch `docs/mvp/tasks.jsonl` – on external change (user or another harness like Claude), log counts, trigger DAG refresh. Debounce 750ms, ignore own writes.
- Watch `docs/mvp/.progress/*.json` – each task executor writes its own progress file (no contention). Orchestrator polls these instead of relying solely on Claude's `TaskList`. Completion signal is harness-agnostic STATUS block + progress file.
- Watch `docs/mvp/.progress/` dir creation – auto .gitignore.

Implementation in plugin:
```ts
event: async ({event}) => {
  if(event.type === "file.watcher.updated"){
    const {file, event:fsEvent} = event.properties
    // shouldHandle = docs/mvp or .progress or tasks.jsonl, debounce, ignore ownWrites
  }
}
```

Avoid feedback loops:
- Before writing progress file, set `ownWrites.set(file, Date.now())`
- Skip watcher event if within 1500ms of own write
- Use atomic tmp+rename or `apply_patch`

## Shared Task Protocol (Cross-Harness)

`docs/mvp/tasks.jsonl` (or custom `artifacts_dir` via `configuring-orchestra`) is the durable state:
- JSON Lines, append-only across features, file-wide sequential IDs `T001...T999`. Never reset per feature.
- Fields: `id`, `feature` (kebab slug – orchestrator scopes to one), `goal` (imperative), `success_criteria` (verifiable – test command/file/API), `status` (`open|in_progress|closed|blocked`), `complexity` (`low|medium|high` default medium), `dependencies` (IDs), `resources` (paths).
- New tasks discovered by executors: partial object `{goal,success_criteria,dependencies,resources}` – orchestrator appends with sequential ID, same feature.
- ID collision: concurrent breakdowns may claim same range; merge conflict is mechanical keep-both, renumber later side to `max(existing)+1` and rewrite its deps. Script `renumber-tasks.py` + `merge-resolver` handles.
- Status lifecycle: `open → in_progress (orchestrator) → closed (after merge)`, `blocked` on failed dep/merge/stuck.

**Harness-agnostic completion signal** (MUST be emitted by every executor, regardless of TaskUpdate availability):
```
STATUS: completed|stuck
WORKTREE_PATH: /abs/path/to/worktree
BRANCH_NAME: branch-name
VERIFICATION: <command you ran and summary>
NEW_TASKS: [...]
NOTES: <=2 sentences if orchestrator must act
```
Field names are load-bearing – orchestrator parses when `TaskUpdate` unavailable (Pi, Codex, OpenCode). Keep order.

**Progress files** (`<artifacts_dir>/.progress/T001.json`):
```json
{
  "id":"T003","feature":"user-auth-jwt","status":"in_progress|completed|stuck",
  "harness":"opencode","executor_model":"sonnet","worktree_path":"/abs","branch_name":"orchestra/T003-...",
  "started_at":"ISO","updated_at":"ISO","progress_log":["..."],"verification":"pytest... 3 passed",
  "stuck_message":null,"new_tasks":[],"notes":null
}
```
One file per task, no contention. Executor owns its file. Orchestrator polls `Glob .progress/*.json` as primary when Claude `TaskList` unavailable.

## Compaction Hook – State Preservation

Unique to OpenCode: `experimental.session.compacting` can push context into compaction prompt, or replace it.

Orchestra injects:
```
## Orchestra State
Tasks file: docs/mvp/tasks.jsonl
Features: - user-auth-jwt: 5 total (2 open, 1 in_progress, 2 closed), 1 ready
Live progress: T003:in_progress, T004:completed
Shared protocol: append-only IDs, STATUS block, merge-worktree.sh with mandatory integration_path
Resume: re-invoke executing-tasks with feature name, reset stale in_progress→open
```

This survives Qwen and other models that struggle with multiple system messages, because compaction runs automatically.

## Shell Env Hook

Plugin returns `shell.env`:
- `ORCHESTRA_PLUGIN_ROOT` – absolute plugin root
- `ORCHESTRA_SCRIPTS` – scripts dir (ctx-*.sh, merge-worktree.sh, display-dag.py)
- `ORCHESTRA_SKILLS`, `ORCHESTRA_AGENTS`
- `CLAUDE_PLUGIN_ROOT` & `MVP_PLUGIN_ROOT` aliases for compat – many copied skills still reference `${CLAUDE_PLUGIN_ROOT}/scripts/...`

Skills should use `${ORCHESTRA_SCRIPTS}/ctx-test.sh` etc., but compat alias ensures old paths still work.

## Agent Mapping

Claude: `Agent({subagent_type:"mvp:task-executor", isolation:"worktree", run_in_background:true, model:<tier>})`
OpenCode: `task({subagent_type:"orchestra-task-executor"})` + explicit `Bun.$` `git worktree add` before spawn, pass `WORKTREE_PATH` in prompt. Worktree path handling via `git -C $INTEGRATION`.

Model map configurable: `low: haiku → fast model`, `medium: sonnet → standard`, `high: inherit` – read from `.opencode/orchestra.local.md` or `opencode.json` agent model override.

## Script Compatibility

- `ctx-git.sh --repo <path>` – one-line git state, replaces status+log+diff pile (~20x token saving)
- `ctx-read.sh <file>` – outline mode with line numbers
- `ctx-grep.sh <pattern> --files-only` – capped search with true count
- `ctx-test.sh` – detects runner (npm/pnpm/pytest/cargo/go), one-line PASS/FAIL
- `merge-worktree.sh <worktree_path> <branch_name> <integration_path>` – mandatory 3rd arg, exits 0 MERGED, 2 CONFLICT, 1 error, uses `git -C`
- `display-dag.py` – topological levels, icons ○◉✓✗
- `renumber-tasks.py` (new) – renumber colliding IDs

## Custom Tools

- `orchestra_tasks` – handles all tasks.jsonl operations safely (sequential ID alloc, collision append, validation)
- `orchestra_dag` – display DAG, prefers Python script if available, JS fallback

## Differences from Claude mvp

| Feature | Claude mvp | Orchestra OpenCode |
|---------|------------|-------------------|
| Bootstrap | SessionStart hook bash → additionalContext JSON | `experimental.chat.messages.transform` JS hook, cached |
| Task tracking | TaskCreate/Update/List/Get | `.progress/*.json` + STATUS block + file watcher + todowrite |
| Worktree isolation | Agent isolation:worktree param | Explicit `git worktree add` + `Bun.$` |
| Model names | haiku/sonnet/inherit | Configurable anthropic/... etc, permission granularity |
| Skills path | CLAUDE_PLUGIN_ROOT | ORCHESTRA_PLUGIN_ROOT via shell.env + compat alias |
| Compaction | Loses context | Preserves task state via context injection |
| Progress live | TaskList polling only | File watcher + progress files + todo.updated |
| Protection | None | `.env` guard via tool.execute.before |

Keep shared protocol stable so tasks.jsonl can be opened in Claude, Pi, Codex, OpenCode and resume without re-breaking.
