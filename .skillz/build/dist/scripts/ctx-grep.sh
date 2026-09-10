#!/usr/bin/env bash
#
# Capped search. Prints a hit-count summary first, then bounded matches.
#
# Usage:
#   scripts/ctx-grep.sh PATTERN [PATH ...] [--per-file N] [--total N] [--files-only]
#
# Defaults: 3 matches per file, 40 matches total. Always prints the true total
# count first, so a truncated result is never mistaken for a complete one.
# Replaces bare `rg PATTERN` (~233 tokens/call, re-read on every later turn).
#
# Note: ripgrep is a shell function in Claude Code, not a binary, so scripts
# cannot see it. This uses rg only if a real rg executable exists, else grep.
set -euo pipefail

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "error: $*" >&2
  exit 1
}

per_file=3
total_cap=40
files_only=false
pattern=""
paths=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --per-file)
      shift
      [[ $# -gt 0 ]] || die "--per-file needs a number"
      per_file="$1"
      ;;
    --total)
      shift
      [[ $# -gt 0 ]] || die "--total needs a number"
      total_cap="$1"
      ;;
    --files-only) files_only=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      # everything after -- is positional, so patterns may start with a dash
      while [[ $# -gt 0 ]]; do
        if [[ -z "$pattern" ]]; then pattern="$1"; else paths+=("$1"); fi
        shift
      done
      break
      ;;
    -*) die "unknown option: $1 (use -- to search for a pattern starting with a dash)" ;;
    *)
      if [[ -z "$pattern" ]]; then pattern="$1"; else paths+=("$1"); fi
      ;;
  esac
  shift
done

[[ -n "$pattern" ]] || {
  usage
  exit 1
}
[[ "${#paths[@]}" -gt 0 ]] || paths=(".")

if [[ -x "$(command -v rg 2>/dev/null || true)" ]]; then
  searcher=(rg --no-heading --line-number --color=never)
else
  searcher=(grep -rnI --color=never)
fi

# One pass. Counts are derived from the matches themselves, so the summary can
# never disagree with the listing (and zero-match files are never counted).
matches="$("${searcher[@]}" -- "$pattern" "${paths[@]}" 2>/dev/null || true)"
match_count="$(printf '%s' "$matches" | grep -c . || true)"
file_count="$(printf '%s' "$matches" | awk -F: 'NF { print $1 }' | sort -u | grep -c . || true)"

printf '%s matching lines in %s files\n' "$match_count" "$file_count"
[[ "$match_count" -eq 0 ]] && exit 0

if [[ "$files_only" == true ]]; then
  printf '%s' "$matches" | awk -F: 'NF { print $1 }' | sort | uniq -c | sort -rn \
    | head -n "$total_cap" | sed 's/^/  /'
  exit 0
fi

printf '%s' "$matches" | awk -F: -v per="$per_file" -v cap="$total_cap" '
  NF && ++seen[$1] <= per && ++shown <= cap { print "  " $0 }
' || true

if [[ "$match_count" -gt "$total_cap" ]]; then
  printf '  (capped at %s of %s; --total N, --files-only, or narrow the pattern)\n' \
    "$total_cap" "$match_count"
fi
