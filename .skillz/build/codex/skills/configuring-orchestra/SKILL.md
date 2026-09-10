---
name: configuring-orchestra
description: Use when any orchestra skill needs to write specs, plans, or the task file and no config exists yet, or when the user asks to change where artifacts should live. Runs one-time setup asking where artifacts should live, persists to .opencode/orchestra.local.md (fallback .claude/mvp.local.md).
---

# Configuring Orchestra

Where orchestra writes its working documents — specs, plans, the task file, findings notes — is configurable per project. The default is inside the repo; the setup flow lets your human partner choose somewhere else.

## The config file (OpenCode-native)

Primary: `.opencode/orchestra.local.md` at project root (OpenCode convention)
Fallback: `.claude/mvp.local.md` (for cross-harness compatibility – shared protocol)

YAML frontmatter plus free-form notes:

```markdown
---
artifacts_dir: docs/mvp
---

# orchestra settings

Personal, per-project. Add this file to .gitignore.
```

**Keys:**

| Key | Default | Meaning |
|-----|---------|---------|
| `artifacts_dir` | `docs/mvp` | Root for all artifacts. Repo-relative or absolute. |
| `models` | `low: haiku`, `medium: sonnet`, `high: inherit` | Maps task `complexity` to executor model. In OpenCode: can be `anthropic/claude-sonnet-4`, `opencode/gpt-5`, etc. `inherit` = session model. |
| `progress_dir` | `<artifacts_dir>/.progress` | Live progress files (orchestra-specific) – one JSON per task, file watcher sync |

```yaml
models:
  low: haiku
  medium: sonnet
  high: inherit
```

**Derived paths** (never configured separately — always resolved from the root):

- Specs: `<artifacts_dir>/specs/YYYY-MM-DD-<topic>-design.md`
- Plans: `<artifacts_dir>/plans/YYYY-MM-DD-<feature-name>.md`
- Task file: `<artifacts_dir>/tasks.jsonl`
- Bug-bash findings: `<artifacts_dir>/specs/YYYY-MM-DD-bug-bash-findings.md`
- Progress files: `<artifacts_dir>/.progress/T*.json` (live – file watcher, gitignored)
- DAG cache: ephemeral – via `orchestra_dag` tool

## Resolution procedure (for every skill that writes artifacts)

1. Read `.opencode/orchestra.local.md`. If exists and has `artifacts_dir`, use it. **Do not ask again.**
2. If missing, read fallback `.claude/mvp.local.md` for cross-harness compat. If that exists, use it and (optionally) copy to `.opencode/orchestra.local.md` for OpenCode.
3. If both missing, run setup flow below **once**, write file to `.opencode/orchestra.local.md`, then continue.
4. `mkdir -p` derived directory + `<artifacts_dir>/.progress` before writing. Ensure `.progress` is gitignored (file watcher needs it, but not versioned). Suggest adding `.progress/` and `orchestra.local.md` to `.gitignore`.

## Setup flow (first write in a project, or on request)

Ask your human partner — one question, two options plus free-form:

> **Where should orchestra save its working documents** (specs, plans, tasks.jsonl, progress)?
>
> 1. **In this repo at `docs/mvp/`** (recommended) — artifacts version with code and double as history; keeps shared protocol compatible with Claude mvp (same path).
> 2. **Custom path** — another repo-relative directory, or absolute path (e.g. notes vault). Note: outside repo, artifacts don't version with code, and worktree isolation is lost — concurrent sessions and parallel executors share one live task file.

Then:

1. Write `.opencode/orchestra.local.md` with chosen `artifacts_dir` (use template above). Also write fallback `.claude/mvp.local.md` if user wants cross-harness sharing (ask: "Also write .claude/mvp.local.md for Claude compatibility?").
2. `mkdir -p <artifacts_dir>/.progress` and ensure `.progress/` is in `.gitignore` (live files, file watcher).
3. If `.opencode/orchestra.local.md` not covered by `.gitignore`, suggest adding it.
4. If custom path absolute/outside repo, confirm exists and writable before continuing.
5. Announce: "orchestra artifacts will be saved to `<path>`, progress to `<path>/.progress` (file watcher enabled)."

The setup flow only asks about `artifacts_dir` — model map is power-user knob changed on request ("run orchestra executors on haiku", "always use session model").

**Changing it later:** user asks ("save plans somewhere else") — re-run flow, update frontmatter, offer to move existing artifacts (`git mv` for tracked; plain move otherwise). Never move without asking. Offer to copy to both config locations for cross-harness.

## Rules

- Ask **once per project**, at first moment a skill needs to write — never at session start, never block read-only step.
- Config governs where artifacts are *written*; skills reading existing tasks.jsonl or spec should look configured location first, then fallback `docs/mvp/` default.
- Orchestrator and task-executor agents receive explicit absolute paths in prompts — resolve config in main session and pass through; agents never read config themselves.
- File watcher: `.progress/*.json` is live state, not versioned. `tasks.jsonl` is durable append-only source of truth. Ensure watcher not ignoring `docs/mvp/**` (check `opencode.json` `watcher.ignore`).
- Shared protocol: keep `tasks.jsonl` schema identical to mvp for cross-harness resume. Progress files are orchestra-specific additive.
