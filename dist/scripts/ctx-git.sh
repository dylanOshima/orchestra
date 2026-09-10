#!/usr/bin/env bash
#
# One-line git state instead of a status/log/diff pile.
#
# Usage:
#   scripts/ctx-git.sh [--files] [--repo DIR]
#
# Prints a single line: branch, upstream divergence, dirty counts, HEAD subject.
# --files additionally lists changed paths (names only, capped).
# Replaces the common `git status && git log -1 && git diff --stat` compound,
# which costs ~100 tokens per call and is re-read on every later turn.
set -euo pipefail

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "error: $*" >&2
  exit 1
}

show_files=false
repo="."
max_files=40

while [[ $# -gt 0 ]]; do
  case "$1" in
    --files) show_files=true ;;
    --repo)
      shift
      [[ $# -gt 0 ]] || die "--repo needs a directory"
      repo="$1"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

cd "$repo" || die "no such directory: $repo"
git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository: $repo"

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(detached)')"

divergence="no-upstream"
if upstream="$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)"; then
  counts="$(git rev-list --left-right --count "@{upstream}...HEAD" 2>/dev/null || echo "0	0")"
  behind="${counts%%	*}"
  ahead="${counts##*	}"
  divergence="vs ${upstream}: +${ahead}/-${behind}"
fi

staged=0
unstaged=0
untracked=0
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  case "$line" in
    '??'*) untracked=$((untracked + 1)) ;;
    *)
      [[ "${line:0:1}" == " " ]] || staged=$((staged + 1))
      [[ "${line:1:1}" == " " ]] || unstaged=$((unstaged + 1))
      ;;
  esac
done < <(git status --porcelain 2>/dev/null)

subject="$(git log -1 --format='%h %s' 2>/dev/null || echo 'no commits')"

printf '%s | %s | staged:%d unstaged:%d untracked:%d | %s\n' \
  "$branch" "$divergence" "$staged" "$unstaged" "$untracked" "$subject"

if [[ "$show_files" == true ]]; then
  total="$(git status --porcelain | wc -l | tr -d ' ')"
  git status --porcelain | head -n "$max_files" | sed 's/^/  /'
  if [[ "$total" -gt "$max_files" ]]; then
    printf '  ... %d more (run: git status --porcelain)\n' "$((total - max_files))"
  fi
fi
