---
description: Start orchestra brainstorming – classify request (spike/bounded/architectural), refine idea, get approval, write spec
agent: build
---

You are starting orchestra brainstorming for: $ARGUMENTS

If $ARGUMENTS is empty, ask user what they want to build.

Follow the `brainstorming` skill exactly:

1. Use `skill` tool to load `brainstorming`
2. Classify as spike/bounded/architectural out loud
3. For bounded: explore context, ask clarifying Qs one at a time, present short design in chat, get approval, then proceed via normal dev workflow
4. For architectural: full process – explore, offer visual companion just-in-time (browser mockups only when genuinely visual), ask Qs one at a time, propose 2-3 approaches with trade-offs, present design sections scaled, get approval per section, write design doc to `<artifacts_dir>/specs/YYYY-MM-DD-<topic>-design.md` (resolve via `configuring-orchestra`), commit, self-review, user reviews spec, then enter isolated worktree via `using-git-worktrees` and invoke `task-breakdown`
5. Use `ORCHESTRA_SCRIPTS` env for ctx-* scripts via bash

Current artifacts dir: check `.opencode/orchestra.local.md` or `.claude/mvp.local.md` fallback, default `docs/mvp`.

Announce "Using brainstorming to [purpose]" and follow its checklist with todos.
