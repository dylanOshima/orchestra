---
description: Finish a development branch – verify tests, merge/PR/keep/discard, cleanup worktrees
agent: build
---

Finish development branch for: $ARGUMENTS

Follow `finishing-a-development-branch` skill exactly:

1. `skill` tool load `finishing-a-development-branch`
2. Verify tests via `bash ${ORCHESTRA_SCRIPTS}/ctx-test.sh` – real pass/fail counts only
3. Detect env (`GIT_DIR` vs `GIT_COMMON`), determine base branch
4. Present 3-options menu (merge / PR / keep / discard) or 2 for detached HEAD
5. Execute merge/push/PR, cleanup worktrees with provenance check (only `.worktrees/` owned), never `--force` unless user typed `discard`
6. Ensure `tasks.jsonl` closed tasks remain, `.progress/*.json` optionally cleaned (keep for history or remove – ask user)
7. If feature shipped or changed web UI, suggest bug bash

$ARGUMENTS may contain finishing instructions
