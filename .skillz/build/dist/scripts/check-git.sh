#!/bin/bash
# check-git.sh
# Checks if the current directory is inside a git repository.
# If inside a repo: exits 0.
# If not: prints a message and exits 1 (caller must handle git-init offer).

if git rev-parse --git-dir > /dev/null 2>&1; then
    exit 0
fi

echo "NOT_A_GIT_REPO: No git repository found in $(pwd)"
echo "Pool Party requires a git repository to manage task worktrees."
exit 1
