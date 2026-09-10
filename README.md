# Orchestra – OpenCode-native MVP successor

> Fast-flow fork of [superpowers/mvp](https://github.com/obra/superpowers) for OpenCode: `brainstorm → growing task JSONL → parallel subagent delivery`

OpenCode-native, TypeScript, shared task protocol (works across Claude, Pi, Codex, OpenCode), file watcher live sync.

> [!IMPORTANT]
> **Parked at 2026-08-26** – initial implementation + local file:// install verified, GitHub pushed, notes saved to ai-brain `3-resources/opencode/plugin-dev/`. Global file:// install works, git+https install hits Bun `git dep preparation failed`, npm publish pending. See [docs/FOLLOW-UP.md](docs/FOLLOW-UP.md) for known issues, blockers, and next steps.

## Why Orchestra?

`mvp` was built for Claude Code (SessionStart hooks, `TaskCreate`/`Agent(isolation:worktree)`). Orchestra is **OpenCode-first**:

- **TypeScript plugin** `src/index.ts` with proper `@opencode-ai/plugin` types – no bash hook
- **Config hook** injects skills path → zero symlink install
- **Shell env hook** sets `ORCHESTRA_PLUGIN_ROOT` + compat `CLAUDE_PLUGIN_ROOT` alias so old `${CLAUDE_PLUGIN_ROOT}/scripts/*` still works
- **Message transform** – cached bootstrap `using-orchestra` injected into first user message (Qwen-safe, not repeated)
- **Compaction hook** – preserves `tasks.jsonl` state across context compaction (unique to OpenCode)
- **File watcher** – watches `tasks.jsonl` + `.progress/*.json` live, debounced 750ms, logs via `client.app.log`, avoids feedback loops
- **Custom tools** – `orchestra_tasks` (read/append/update-status/list/validate, sequential ID T001... file-wide) + `orchestra_dag` (display-dag.py wrapper)
- **Shared task protocol** – `docs/mvp/tasks.jsonl` append-only, IDs file-wide sequential, `STATUS` block `WORKTREE_PATH/BRANCH_NAME/VERIFICATION/NEW_TASKS` is harness-agnostic fallback, so Claude can resume orchestra tasks and vice versa
- **Progress files** – `<artifacts_dir>/.progress/T*.json` one per task, no contention, file watcher friendly, gitignored
- **Agents** – OpenCode format (`mode:subagent`, `permission.task`, `hidden:true`), explicit `git worktree add` before `task` spawn (OpenCode `task` tool has no isolation param)
- **Commands** – `/orchestra-brainstorm`, `/orchestra-breakdown`, `/orchestra-execute`, `/orchestra-finish` with `$ARGUMENTS`, shell injection
- **Renumber script** – `renumber-tasks.py` handles append-append ID collisions (mechanical keep-both, renumber second side to `max+1`, rewrite deps)

## Installation

### NPM (unscoped, primary)

```bash
npm install opencode-orchestra
# or
bun add opencode-orchestra
```

Add to your `opencode.json` (global `~/.config/opencode/opencode.json` or project):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-orchestra"]
}
```

Restart OpenCode. Verify:

```bash
opencode run --print-logs "hello" 2>&1 | grep -i orchestra
# Use skill tool to list skills
```

You should see `brainstorming`, `task-breakdown`, `executing-tasks`, `using-orchestra`, etc.

### Git install (no npm)

```json
{
  "plugin": ["opencode-orchestra@git+https://github.com/dylanOshima/orchestra.git"]
}
```

If git install fails with `git dep preparation failed` (Bun bug with exports), workaround:
```bash
npm install opencode-orchestra@git+https://github.com/dylanOshima/orchestra.git --prefix ~/.config/opencode
```
Then in `opencode.json`:
```json
{ "plugin": ["~/.config/opencode/node_modules/opencode-orchestra"] }
```

### Local dev (filesystem plugins) – file:// install

```bash
git clone https://github.com/dylanOshima/orchestra.git
cd orchestra
npm install && npm run build

# Global via file:// (recommended local)
opencode plugin opencode-orchestra@file:///path/to/orchestra --global

# Or manual filesystem:
mkdir -p ~/.config/opencode/plugins
ln -sf /path/to/orchestra/dist/index.js ~/.config/opencode/plugins/opencode-orchestra.js
# Or directly TS:
cp src/index.ts ~/.config/opencode/plugins/opencode-orchestra.ts
```

`src/skills` auto-discovered via config hook – no symlink needed for skills.

## Usage

### Skills (native OpenCode `skill` tool)

```
use skill tool to list skills
use skill tool to load brainstorming
```

Flow:

1. `/orchestra-brainstorm Build a user auth JWT feature` – classifies spike/bounded/architectural, refines idea, writes spec `docs/mvp/specs/YYYY-MM-DD-topic-design.md`
2. `/orchestra-breakdown docs/mvp/specs/...-design.md` – converts spec to DAG tasks appended to `docs/mvp/tasks.jsonl` (file-wide T001...), displays DAG via `orchestra_dag`
3. `/orchestra-execute user-auth-jwt` – launches `orchestra-orchestrator` which spawns up to 5 `orchestra-task-executor` in isolated worktrees, merges via `merge-worktree.sh <wt> <branch> <integration>` (mandatory 3rd arg), conflicts to `orchestra-merge-resolver`, live progress via `.progress/*.json` watcher
4. `/orchestra-finish` – full test suite `ctx-test.sh`, merge/PR/keep/discard, cleanup worktrees

Resume: re-invoke `executing-tasks` with feature slug – orchestrator picks up non-closed from `tasks.jsonl`. Reset stale `in_progress → open`.

### Custom tools

- `orchestra_tasks` – `action: read|append|update-status|list|validate`
  - `read`: load all or filtered by feature
  - `append`: add new tasks JSON, auto sequential IDs
  - `update-status`: set `open|in_progress|closed|blocked`
  - `list`: summary + DAG list
  - `validate`: check duplicate IDs, parse errors
- `orchestra_dag` – display DAG, prefers `display-dag.py`, JS fallback with icons ○◉✓✗

### File watcher (live)

Watches:

- `docs/mvp/tasks.jsonl` – external edits (Claude picking up same file), logs counts
- `docs/mvp/.progress/*.json` – each executor's live state, logs stuck/completed

Avoids feedback: tracks own writes `Map<file,timestamp>` + debounce 750ms.

Configure watcher ignore in `opencode.json`:

```json
{
  "watcher": {"ignore": ["node_modules/**", "dist/**", ".git/**", ".worktrees/**"]}
}
```

Ensure `docs/mvp/**` NOT ignored.

### Shared task protocol (cross-harness)

`docs/mvp/tasks.jsonl`:

- JSON Lines, one object per line, append-only
- `id: T001`, file-wide sequential, never per-feature reset
- `feature: kebab-slug`, `goal`, `success_criteria` (verifiable), `status`, `complexity: low|medium|high`, `dependencies: []`, `resources: []`
- ID collision on concurrent append: mechanical keep-both, renumber second side `max+1` via `renumber-tasks.py`, rewrite its deps
- Completion signal (harness-agnostic, load-bearing field names):
```
STATUS: completed|stuck
WORKTREE_PATH: /abs
BRANCH_NAME: branch
VERIFICATION: <cmd summary>
NEW_TASKS: [...]
NOTES: <=2 sentences
```

Progress files `<artifacts_dir>/.progress/T*.json` – additive, one per task, no contention.

So Claude `mvp:executing-tasks` can resume same `tasks.jsonl` that orchestra created, and vice versa.

## Structure

```
orchestra/
├── src/
│   ├── index.ts            # Plugin entry – OrchestraPlugin, SuperpowersPlugin alias
│   ├── skills/             # 14 skills + using-orchestra + opencode-tools reference
│   │   ├── using-orchestra/references/opencode-tools.md
│   │   └── configuring-orchestra/ (OpenCode .opencode/orchestra.local.md fallback .claude/mvp.local.md)
│   ├── agents/             # orchestrator, task-executor, merge-resolver – OpenCode format hidden subagents
│   ├── commands/           # orchestra-brainstorm, breakdown, execute, finish
│   ├── tools/              # orchestra-tasks.ts, orchestra-dag.ts
│   └── scripts/            # ctx-*.sh, merge-worktree.sh (3rd arg mandatory), display-dag.py, renumber-tasks.py
├── dist/                   # built JS + copied assets
├── package.json
└── README.md
```

## How it differs from mvp

| Feature | mvp (Claude) | orchestra (OpenCode) |
|---------|--------------|----------------------|
| Bootstrap | SessionStart hook bash JSON | `experimental.chat.messages.transform` cached |
| Task tracking | TaskCreate/Update/List/Get | `.progress/*.json` + STATUS block + file watcher + todowrite |
| Worktree isolation | `Agent(isolation:worktree)` | Explicit `git worktree add` + `Bun.$` |
| Model names | haiku/sonnet/inherit | Configurable anthropic/opencode models |
| Skills path | CLAUDE_PLUGIN_ROOT | ORCHESTRA_PLUGIN_ROOT + compat alias |
| Compaction | Loses tasks | Preserves via context injection |
| Progress live | TaskList polling | File watcher + progress files |
| Protection | None | `.env` guard via tool.execute.before |
| Distribution | marketplace.json git submodule | npm unscoped `opencode-orchestra` + git+https + file:// local |

## Development

```bash
npm run build
npm run typecheck
# Test loading
opencode run --print-logs "list skills" 2>&1 | grep orchestra
```

Publish:

```bash
npm publish --dry-run
npm publish # unscoped public
```

## Troubleshooting

- **Plugin not loading**: check `opencode run --print-logs`, verify `opencode.json` plugin line, recent OpenCode version
- **Skills not found**: `skill` tool list, check `skillsDir` resolution (tries `dist/skills`, `src/skills`, etc)
- **Bootstrap not appearing**: check `experimental.chat.messages.transform` supported (recent OpenCode), restart
- **File watcher not firing**: check `watcher.ignore` not excluding `docs/mvp`, ensure `.progress` dir exists
- **Tasks collision**: run `python3 src/scripts/renumber-tasks.py docs/mvp/tasks.jsonl --check` / `--fix`

## License

MIT – fork of [obra/superpowers](https://github.com/obra/superpowers) v6.3.0 + pool-party engine, now OpenCode-native.

## Ecosystem

- OpenCode docs: https://opencode.ai/docs/plugins
- Orchestra repo: https://github.com/dylanOshima/orchestra
- Original mvp: in `dro-claude-marketplace/mvp/`
