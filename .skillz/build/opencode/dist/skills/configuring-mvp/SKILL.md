---
name: configuring-mvp
description: Use when any mvp skill needs to write specs, plans, or the task file and no mvp config exists yet, or when the user asks to change where mvp saves its working documents. Runs a one-time setup asking the user where artifacts should live, then persists the choice to .claude/mvp.local.md.
---

# Configuring mvp

Where mvp writes its working documents — specs, plans, the task file, findings notes — is configurable per project. The default is inside the repo; the setup flow lets your human partner choose somewhere else (another repo directory, or an absolute path such as a notes vault).

## The config file

`.claude/mvp.local.md` at the project root, following Claude Code's plugin-settings pattern — YAML frontmatter plus free-form notes:

```markdown
---
artifacts_dir: docs/mvp
---

# mvp settings

Personal, per-project. Add this file to .gitignore.
```

**Keys:**

| Key | Default | Meaning |
|-----|---------|---------|
| `artifacts_dir` | `docs/mvp` | Root for all mvp artifacts. Repo-relative or absolute. |
| `models` | `low: haiku`, `medium: sonnet`, `high: inherit` | Maps task `complexity` to the executor model. `inherit` = the session's model. Partial maps are fine — unnamed tiers keep their defaults. |

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

## Resolution procedure (for every skill that writes artifacts)

1. Read `.claude/mvp.local.md`. If it exists and has `artifacts_dir` in its frontmatter, use it. **Do not ask again.**
2. If the file is missing, run the setup flow below **once**, write the file, then continue with the original task.
3. `mkdir -p` the derived directory before writing into it.

## Setup flow (first write in a project, or on request)

Ask your human partner — one question, two options plus free-form:

> **Where should mvp save its working documents** (specs, plans, tasks.jsonl)?
>
> 1. **In this repo at `docs/mvp/`** (recommended) — artifacts version with the code and double as project history.
> 2. **Custom path** — another repo-relative directory, or an absolute path (e.g. a notes vault). Note: outside the repo, artifacts don't version with the code, and worktree isolation is lost — concurrent sessions generating tasks, and parallel task-executors, all share one live task file.

Then:

1. Write `.claude/mvp.local.md` with the chosen `artifacts_dir` (use the template above).
2. If `.claude/mvp.local.md` is not covered by `.gitignore`, suggest adding it — the file is personal, per-project configuration.
3. If the chosen path is inside the repo but non-default, no other action needed. If it's absolute/outside the repo, confirm the directory exists and is writable before continuing.
4. Announce the result in one line: "mvp artifacts will be saved to `<path>`."

The setup flow only asks about `artifacts_dir` — the model map is a power-user knob changed on request ("run mvp executors on haiku", "always use the session model"), not part of the one-time ask.

**Changing it later:** the user can ask ("save mvp plans somewhere else") — re-run the flow, update the frontmatter, and offer to move existing artifacts (`git mv` for tracked files; plain move otherwise). Never move artifacts without asking.

## Rules

- Ask **once per project**, at the first moment a skill actually needs to write — never at session start, and never block a read-only step on config.
- The config governs where artifacts are *written*; skills reading an existing tasks.jsonl or spec should look in the configured location first, then fall back to the `docs/mvp/` default for projects configured before a path change.
- Orchestrator and task-executor agents receive explicit paths in their prompts — resolve the config in the main session and pass absolute paths through; agents never read the config themselves.
