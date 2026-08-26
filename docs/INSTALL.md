# Installing Orchestra for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- Bun or Node 18+
- Python3 (for `display-dag.py`, optional JS fallback works)

## NPM Install (unscoped)

Add orchestra to your `opencode.json` (global or project-level):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-orchestra"]
}
```

Restart OpenCode. The plugin installs through Bun and registers all skills, agents, commands, tools.

Verify:

```bash
opencode run --print-logs "hello" 2>&1 | grep -i orchestra
```

List skills:

```
use skill tool to list skills
```

You should see `brainstorming`, `task-breakdown`, `executing-tasks`, `using-orchestra`, etc.

## Git Install (no npm)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-orchestra@git+https://github.com/dylanOshima/orchestra.git"]
}
```

Restart OpenCode.

## Local Filesystem Install

Clone repo:

```bash
git clone https://github.com/dylanOshima/orchestra.git
cd orchestra
npm install && npm run build
```

Option A – project-level plugin (`.opencode/plugins`):

```bash
mkdir -p .opencode/plugins
cp dist/index.js .opencode/plugins/orchestra.js
```

Option B – global:

```bash
mkdir -p ~/.config/opencode/plugins
cp dist/index.js ~/.config/opencode/plugins/orchestra.js
```

Skills auto-discovered via `config.skills.paths` hook – no symlink needed.

Alternatively, use TS directly:

```bash
cp src/index.ts ~/.config/opencode/plugins/orchestra.ts
```

## What the Plugin Does

1. **Injects skills path** via `config` hook – OpenCode discovers orchestra skills without symlinks
2. **Sets env vars** via `shell.env` – `ORCHESTRA_PLUGIN_ROOT`, `ORCHESTRA_SCRIPTS`, `ORCHESTRA_AGENTS`, plus compat `CLAUDE_PLUGIN_ROOT` alias so copied mvp skills referencing `${CLAUDE_PLUGIN_ROOT}` still work
3. **Injects bootstrap** via `experimental.chat.messages.transform` – `using-orchestra` skill content + tool mapping, cached per session
4. **Preserves state across compaction** via `experimental.session.compacting` – injects `tasks.jsonl` summary
5. **Watches files** via `event: file.watcher.updated` – `tasks.jsonl` + `.progress/*.json` live, debounced, logs via `client.app.log`
6. **Provides custom tools** – `orchestra_tasks` (read/append/update-status/list/validate) + `orchestra_dag` (DAG visualization)
7. **Injects agents and commands** – `orchestra-orchestrator`, `orchestra-task-executor`, `orchestra-merge-resolver`, plus `/orchestra-brainstorm`, `/orchestra-breakdown`, `/orchestra-execute`, `/orchestra-finish`

## Tool Mapping

Skills speak in actions – on OpenCode these resolve to:

- Create/update todos → `todowrite`
- `Agent({subagent_type:...})` → `task` with `subagent_type: "general"` or `orchestra-*`
- Invoke a skill → `skill` tool (bare names: `brainstorming` not `mvp:brainstorming`)
- Read files → `read`
- Create/edit/delete → `apply_patch`
- Shell → `bash`
- Search → `grep`, `glob`
- Fetch URL → `webfetch`
- Task management → `orchestra_tasks`
- DAG display → `orchestra_dag`

## Shared Task Protocol

`docs/mvp/tasks.jsonl` is append-only, file-wide sequential IDs `T001...`, shared across harnesses. Completion signal is `STATUS` block + `.progress/*.json` – both harness-agnostic. So Claude `mvp:executing-tasks` can resume same file orchestra created.

## Updating

OpenCode installs orchestra via Bun. Cache in `~/.cache/opencode/node_modules/`. If updates don't appear, clear cache:

```bash
rm -rf ~/.cache/opencode/node_modules/orchestra
# or
opencode plugin install orchestra --force
```

Pin version:

```json
{
  "plugin": ["orchestra@0.1.0"]
}
```

Or git tag:

```json
{
  "plugin": ["opencode-orchestra@git+https://github.com/dylanOshima/orchestra.git#v0.1.0"]
}
```

## Troubleshooting

### Plugin not loading

1. `opencode run --print-logs "hello" 2>&1 | grep -i orchestra`
2. Verify `opencode.json` plugin line
3. Recent OpenCode version required (`>=1.18`)

### Skills not found

1. `skill` tool list what's discovered
2. Check plugin loading (above)
3. Ensure `dist/skills/*/SKILL.md` exists (`npm run build` copies assets)

### Commands not found

Run `opencode debug config | grep command` – should list `orchestra-brainstorm`, etc. If not, ensure `dist/commands/*.md` exists and plugin built.

### File watcher not firing

Check `opencode.json` `watcher.ignore` – ensure `docs/mvp/**` NOT ignored. Default ignore `node_modules/**, dist/**, .git/**, .worktrees/**, worktrees/**` is okay, but adding `docs/**` would break. Verify `.progress` dir exists via `configuring-orchestra` skill.

### Tasks collision

```bash
python3 src/scripts/renumber-tasks.py docs/mvp/tasks.jsonl --check
python3 src/scripts/renumber-tasks.py docs/mvp/tasks.jsonl --fix
```

Or use tool: `orchestra_tasks action validate`.

## Uninstall

Remove from `opencode.json` plugin array, delete caches:

```bash
rm -rf ~/.cache/opencode/node_modules/orchestra
rm -f ~/.config/opencode/plugins/orchestra.js
```

## Getting Help

- Issues: https://github.com/dylanOshima/orchestra/issues
- OpenCode docs: https://opencode.ai/docs/plugins
- Original mvp: https://github.com/obra/superpowers
