# Follow-up / Parked – Orchestra

> Parked at 2026-08-26 after initial implementation + local file:// install verified. Global file:// install works, git+https install hits Bun preparation bug, npm publish pending.

## Current State

- Repo: https://github.com/dylanOshima/orchestra – 4 commits, `main` pushed, `dist/` tracked (required for git installs)
- Package: `opencode-orchestra` v0.1.0 – renamed from `orchestra` (taken on npm 3.1.3), still unscoped
- Plugin entry: `src/index.ts` – 5 hooks (config, shell.env, messages.transform cache, session.compacting, file watcher + tool hooks), custom tools `orchestra_tasks` + `orchestra_dag`
- Skills: 16 (14 mvp + configuring-orchestra + using-orchestra + opencode-tools.md)
- Agents: 3 hidden subagents with permission.task gating – `orchestra-orchestrator`, `task-executor`, `merge-resolver` – colors fixed to primary/success/warning
- Commands: 4 – brainstorm, breakdown, execute, finish – injected via config.command
- Scripts: ctx-*, merge-worktree.sh mandatory 3rd arg, display-dag.py, renumber-tasks.py new
- Build: `tsconfig.json` moduleResolution bundler, strict false, include only index + tools, copy-assets.mjs copies skills/agents/commands/scripts
- Docs: README, INSTALL, TASK-PROTOCOL, plus this file

## Verified

- `npm run build` → `Assets copied to dist/`
- `opencode plugin opencode-orchestra@file:///Users/droshima/Documents/code/llms/orchestra --global` → installed, `opencode debug config` shows plugin origins file://, skills.paths dist/skills, agents, commands
- `opencode run --print-logs | grep Orchestra plugin loaded` → log shows skills/agents/scripts paths
- `skill` tool lists 16 orchestra skills
- `orchestra_tasks action list` + `orchestra_dag` with test `docs/mvp/tasks.jsonl` (2 tasks T001→T002) → ready 1, DAG
- `renumber-tasks.py --check/--fix` – detects duplicate T001, renumbers to T003 (bug: dependency rewrite rewrites T002's dep to T003 incorrectly – needs fix)
- `executing-tasks` skill loads and mentions ORCHESTRA_SCRIPTS, orchestra_tasks, file watcher
- Notes saved to ai-brain: `3-resources/opencode/` + `plugin-dev/` with 5 deep-dives + how-to

## Known Issues / Gotchas Encountered

1. **Color validation:** `color: blue/green/yellow` fails OpenCode schema – must be theme colors `primary|secondary|accent|success|warning|error|info` or hex `#RRGGBB`. Fixed.
2. **Dist gitignored:** package.json main `dist/index.js` not in repo → git+file/https clone has no entry. Fixed by committing dist (removed dist from .gitignore, now tracked).
3. **File watcher ignore:** `watcher.ignore` defaults may exclude `docs/mvp/**` if user adds `docs/**` – breaks progress tracking. Documented.
4. **Own writes feedback loop:** need `ownWrites Map<file,timestamp>` + debounce 750ms*2 to skip own progress file writes.
5. **Agent permission task gating:** `task: {"*": deny, "orchestra-task-executor": allow}` hides subagents from Task tool description but still callable via `@` unless `hidden:true`.
6. **Glob tool ignores dotfiles:** `**/.progress/*.json` glob returns 0 via Glob tool, but `read` succeeds – use `bash ls` or file watcher event.
7. **Duplicate plugin origins:** Global file:// + local git+file both orchestra same name/version → loaded once, local wins. Use `OPENCODE_CONFIG_DIR=/tmp/empty` to isolate.
8. **Bun cache nested:** `~/.cache/opencode/packages/orchestra@file:/Users/.../orchestra/node_modules/orchestra` – find needed.

## Blockers

### git+https install fails: `git dep preparation failed`

- `opencode plugin opencode-orchestra@git+https://github.com/dylanOshima/orchestra.git --global --force` fails at Installing plugin package step.
- Cache `~/.cache/opencode/packages/orchestra@git+https:/github.com/...` contains only `node_modules` (dependencies) but no package files like package.json at top level? Actually npm install via git+https works: `npm install git+https://github.com/dylanOshima/orchestra.git` → clones with dist, works. `bun add orchestra@git+https://...` with brew bun 1.4.0 also works.
- So Bun itself can install, but OpenCode's bundled Bun (internal) fails. Possible version mismatch or `exports` field with `types` + `default` triggers preparation that runs `prepublishOnly`? We have `prepublishOnly: npm run build` which requires tsc – maybe OpenCode's Bun install tries to run prepare and fails because typescript not in cache? Yet file:// install doesn't need prepare because dist already exists and file copy includes node_modules?
- Workaround documented in README and INSTALL: `npm install opencode-orchestra@git+https://... --prefix ~/.config/opencode` then `"plugin": ["~/.config/opencode/node_modules/opencode-orchestra"]`
- Next: file issue against OpenCode or try adding `prepare` script that checks dist exists and skips build if present, or change main to `src/index.ts` so no build needed for git installs (Bun can transpile TS directly). Also try adding `bun` field? Check superpowers pattern – their main is `.opencode/plugins/superpowers.js` committed directly, no build.

### npm name collision

- `orchestra` taken (v3.1.3), renamed to `opencode-orchestra` (available). GitHub repo remains `dylanOshima/orchestra` – okay mismatch, package.json repository field points to GitHub. Could also consider scoped `@droshima/opencode-orchestra` if unscoped not desired, but user said unscoped.

## Next Steps (When Resuming)

### Immediate (publish)

- [ ] `npm adduser` + `npm publish --dry-run` + `npm publish` for `opencode-orchestra@0.1.0`
- [ ] Test `opencode plugin opencode-orchestra --global` via npm registry (should work, no git dep)
- [ ] Submit to OpenCode ecosystem: PR to `anomalyco/opencode` docs/ecosystem.md

### Fix git+https

- [ ] Reproduce with OpenCode's internal Bun – extract bun binary path from opencode binary or check `~/.cache/opencode/bin/bun`? Try `opencode debug config` shows bun version?
- [ ] Try changing package.json `main: src/index.ts` (Bun can load TS) and `exports` to point to src for git installs, while npm publish still uses dist via files array – test git+https again
- [ ] Alternatively, add root wrapper `index.js` that re-exports `dist/index.js` if exists else `src/index.ts` via dynamic import
- [ ] File issue against OpenCode: git dep preparation fails when package has `type: module` + `exports` + `prepublishOnly` build script but dist committed

### File watcher live test

- [ ] Create long-running orchestrator session with 2 tasks, modify `.progress/T001.json` after start in another terminal, check `client.app.log` `orchestra-watcher` logs appear
- [ ] Test `todo.updated` sync to tasks.jsonl overview (currently only logs, doesn't write)
- [ ] Verify watcher not ignoring `docs/mvp/**` when user has custom ignore – document warning

### Task protocol fixes

- [ ] Fix `renumber-tasks.py` dependency rewrite bug – when duplicate T001 appears and T002 depends on original T001, naive rewrite rewrites T002's dep to T003 incorrectly. Need to track seen internal to second file vs existing, only rewrite deps that pointed to duplicate old IDs within same file, not original.
- [ ] Add `--check` to `display-dag.py` to warn on duplicate IDs (currently last wins)
- [ ] Add unit tests for `orchestra_tasks` tool (read, append sequential, update-status, validate) and for renumber script

### Agents & Commands hardening

- [ ] Test full E2E: spec → breakdown → execute with 2 independent tasks in isolated worktrees, verify merges on feature branch, full test suite green, finishing branch
- [ ] Test cross-harness: same `tasks.jsonl` opened in Claude `mvp:executing-tasks` resumes tasks created by orchestra
- [ ] Ensure `configuring-orchestra` creates `.progress/` + gitignore suggestion works
- [ ] Add `subagent_depth` config for orchestrator → task-executor nesting

### CI & Docs

- [ ] GitHub Actions: `bun install && npm run build && npm run typecheck`, plus shell lint `lint-shell.sh`, plus opencode load test `opencode debug config | grep orchestra`
- [ ] Add `.opencode/` to repo with `agents/` discovery fallback (currently injected via config hook, but filesystem discovery via `.opencode/agents/*.md` would also work)
- [ ] Update ai-brain notes with parked status and link to this file

### Cleanup

- [ ] Remove test `docs/mvp/` leftovers if any
- [ ] Clear `~/.cache/opencode/packages/orchestra@*` caches after final npm publish
- [ ] Keep global file:// install or switch to npm registry install after publish – document which is active in `~/.config/opencode/opencode.json`

## Parking Decision

Parked to save context – global file:// install works for local dev, GitHub repo pushed, notes saved to ai-brain `3-resources/opencode/plugin-dev/`. Next session can pick up from this file – no need to re-derive architecture, file watcher, task protocol, gotchas.

## Links

- Repo: https://github.com/dylanOshima/orchestra
- Local path: /Users/droshima/Documents/code/llms/orchestra
- Global config: ~/.config/opencode/opencode.json (currently opencode-orchestra@file://)
- Ai-brain: ~/Documents/code/ai-brain/3-resources/opencode/plugin-dev/_index.md
- Original mvp: /Users/droshima/Documents/code/llms/dro-claude-marketplace/mvp/
- OpenCode docs: https://opencode.ai/docs/plugins, skills, agents, commands, custom-tools
