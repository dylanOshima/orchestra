#!/bin/bash
# merge-worktree.sh
# Merges a completed task-executor worktree branch into the feature's
# integration worktree.
#
# Usage: merge-worktree.sh <worktree_path> <branch_name> <integration_path>
#
#   worktree_path     the task executor's worktree (removed on success)
#   branch_name       the executor's branch to merge
#   integration_path  the worktree holding the FEATURE branch to merge into.
#                     Required and explicit: this script must never rely on the
#                     caller's cwd. An agent invoking it inherits whatever
#                     directory it happens to be in — usually the main repo on
#                     the default branch — which silently merges task work into
#                     the wrong branch.
#
# Exit codes:
#   0  - merge succeeded (prints "MERGED:<branch> INTO:<branch>@<path>")
#   1  - usage error, dirty tree, or unexpected failure
#   2  - merge conflict (conflicted files listed on stderr as CONFLICT:<file>,<file>)

set -uo pipefail

WORKTREE_PATH="${1:-}"
BRANCH_NAME="${2:-}"
INTEGRATION_PATH="${3:-}"

if [ -z "$WORKTREE_PATH" ] || [ -z "$BRANCH_NAME" ] || [ -z "$INTEGRATION_PATH" ]; then
    echo "Usage: merge-worktree.sh <worktree_path> <branch_name> <integration_path>" >&2
    echo "  integration_path is required — the merge target must be explicit, never the caller's cwd." >&2
    exit 1
fi

if [ ! -d "$INTEGRATION_PATH" ]; then
    echo "Error: integration path '$INTEGRATION_PATH' does not exist." >&2
    exit 1
fi

# Every git command below runs with -C "$INTEGRATION_PATH". No cd, no cwd
# inheritance, no chance of landing on the caller's branch.
if ! git -C "$INTEGRATION_PATH" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "Error: integration path '$INTEGRATION_PATH' is not a git working tree." >&2
    exit 1
fi

if ! git -C "$INTEGRATION_PATH" rev-parse --verify "$BRANCH_NAME" > /dev/null 2>&1; then
    echo "Error: Branch '$BRANCH_NAME' not found." >&2
    exit 1
fi

INTO_BRANCH=$(git -C "$INTEGRATION_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$INTO_BRANCH" = "HEAD" ]; then
    echo "Error: integration worktree '$INTEGRATION_PATH' is in detached HEAD state." >&2
    exit 1
fi

if [ "$INTO_BRANCH" = "$BRANCH_NAME" ]; then
    echo "Error: refusing to merge '$BRANCH_NAME' into itself at '$INTEGRATION_PATH'." >&2
    exit 1
fi

# A dirty integration tree makes a merge failure ambiguous and can lose work.
if [ -n "$(git -C "$INTEGRATION_PATH" status --porcelain 2>/dev/null)" ]; then
    echo "Error: integration worktree '$INTEGRATION_PATH' (branch $INTO_BRANCH) has uncommitted changes; commit or stash before merging." >&2
    exit 1
fi

# Attempt the merge. Keep the output — a swallowed error is an undiagnosable one.
MERGE_OUTPUT=$(git -C "$INTEGRATION_PATH" merge --no-ff "$BRANCH_NAME" \
    -m "Merge mvp task branch $BRANCH_NAME" 2>&1)
MERGE_EXIT=$?

if [ $MERGE_EXIT -eq 0 ]; then
    git -C "$INTEGRATION_PATH" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
    git -C "$INTEGRATION_PATH" branch -d "$BRANCH_NAME" 2>/dev/null || true
    echo "MERGED:$BRANCH_NAME INTO:$INTO_BRANCH@$INTEGRATION_PATH"
    exit 0
fi

CONFLICTED=$(git -C "$INTEGRATION_PATH" diff --name-only --diff-filter=U 2>/dev/null)
if [ -n "$CONFLICTED" ]; then
    CONFLICT_LIST=$(echo "$CONFLICTED" | tr '\n' ',' | sed 's/,$//')
    echo "CONFLICT:$CONFLICT_LIST" >&2
    echo "Merging $BRANCH_NAME into $INTO_BRANCH at $INTEGRATION_PATH" >&2
    exit 2
fi

# Not a conflict — leave no half-finished merge behind for the next caller.
git -C "$INTEGRATION_PATH" merge --abort 2>/dev/null || true
echo "Merge failed (exit $MERGE_EXIT) merging $BRANCH_NAME into $INTO_BRANCH at $INTEGRATION_PATH:" >&2
echo "$MERGE_OUTPUT" >&2
exit 1
