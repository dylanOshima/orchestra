#!/usr/bin/env bash
#
# Bounded file reading. Outlines by default instead of dumping the whole file.
#
# Usage:
#   scripts/ctx-read.sh FILE [FILE ...] [--full] [--range A,B] [--max N] [--bytes N]
#
# Default prints an outline: markdown headings, or top-level definitions for
# code, each with its line number — enough to decide what to read next without
# paying for the body. --range A,B prints those lines; --full prints all of it
# (still capped by --max, default 400 lines). Output is also capped at --bytes
# (default 20000) so a file with very long lines cannot blow past the line cap,
# and binary files are refused rather than dumped.
set -euo pipefail

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "error: $*" >&2
  exit 1
}

mode="outline"
range=""
max_lines=400
max_bytes=20000
files=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) mode="full" ;;
    --range)
      shift
      [[ $# -gt 0 ]] || die "--range needs A,B"
      range="$1"
      mode="range"
      ;;
    --max)
      shift
      [[ $# -gt 0 ]] || die "--max needs a number"
      max_lines="$1"
      ;;
    --bytes)
      shift
      [[ $# -gt 0 ]] || die "--bytes needs a number"
      max_bytes="$1"
      ;;
    --)
      shift
      files+=("$@")
      break
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*) die "unknown option: $1" ;;
    *) files+=("$1") ;;
  esac
  shift
done

[[ "${#files[@]}" -gt 0 ]] || {
  usage
  exit 1
}

outline_pattern='^[[:space:]]*(#{1,6} |(export )?(async )?(function|class|interface|type|enum|const|let|var) [A-Za-z_]|def |class |func |fn |impl |pub fn |module |describe\(|it\(|test\()'

# Truncate to max_bytes so one pathological long line cannot defeat the line cap.
clamp() {
  local shown
  # Draining the remainder with `cat >/dev/null` matters: without it `head -c`
  # closes the pipe, upstream dies on SIGPIPE, and `set -o pipefail` turns that
  # into exit 141 on an otherwise successful read.
  shown="$( { head -c "$max_bytes"; cat >/dev/null; } )"
  printf '%s' "$shown"
  if [[ "${#shown}" -ge "$max_bytes" ]]; then
    printf '\n... output truncated at %s bytes (--bytes N to raise)\n' "$max_bytes"
  fi
}

for file in "${files[@]}"; do
  if [[ -d "$file" ]]; then
    echo "is a directory, not a file: $file" >&2
    continue
  fi
  [[ -f "$file" ]] || {
    echo "missing: $file" >&2
    continue
  }
  # Binary files would dump control bytes straight into context. An empty file
  # has no line for grep to match, so check size before classifying.
  if [[ ! -s "$file" ]]; then
    printf '=== %s (0 lines) ===\n  empty file\n' "$file"
    continue
  fi
  if LC_ALL=C grep -qI . "$file" 2>/dev/null; then :; else
    printf '=== %s ===\n  binary or non-text file (%s bytes) — not printed\n' \
      "$file" "$(wc -c <"$file" | tr -d ' ')"
    continue
  fi
  total="$(wc -l <"$file" | tr -d ' ')"
  printf '=== %s (%s lines) ===\n' "$file" "$total"

  case "$mode" in
    range)
      start="${range%%,*}"
      end="${range##*,}"
      sed -n "${start},${end}p" "$file" | head -n "$max_lines" | cat -n \
        | awk -v off="$((start - 1))" '{ $1 += off; print }' | clamp
      ;;
    full)
      if [[ "$total" -gt "$max_lines" ]]; then
        head -n "$max_lines" "$file" | cat -n | clamp
        printf '... %d more lines (use --range %d,%d)\n' \
          "$((total - max_lines))" "$((max_lines + 1))" "$total"
      else
        cat -n "$file" | clamp
      fi
      ;;
    outline)
      hits="$(grep -nE "$outline_pattern" "$file" 2>/dev/null | head -n "$max_lines" || true)"
      if [[ -n "$hits" ]]; then
        printf '%s\n' "$hits" | sed 's/^/  /' | clamp
        printf '  (outline only — use --range A,B for a slice, --full for everything)\n'
      else
        head -n 20 "$file" | cat -n | clamp
        # NOTE: a bare `[[ cond ]] && cmd` here would return 1 when the condition
        # is false, and `set -e` would exit on it — an empty or short file would
        # look like a failure. Keep this as a full if/fi.
        if [[ "$total" -gt 20 ]]; then
          printf '... no outline markers; %d more lines\n' "$((total - 20))"
        fi
      fi
      ;;
  esac
done
