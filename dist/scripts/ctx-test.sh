#!/usr/bin/env bash
#
# Run the project's tests and print only what changes a decision.
#
# Usage:
#   scripts/ctx-test.sh [--max N] [-- TEST_ARGS...]
#
# Detects the runner (npm/pnpm/yarn, pytest, cargo, go), prints one PASS/FAIL
# summary line, and on failure the failing names plus a capped tail of output.
# A green run costs ~1 line instead of a full reporter dump.
set -euo pipefail

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
}

max_lines=40
extra=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max)
      shift
      max_lines="$1"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      extra+=("$@")
      break
      ;;
    *) extra+=("$1") ;;
  esac
  shift
done

detect_runner() {
  if [[ -f package.json ]]; then
    if command -v pnpm >/dev/null 2>&1 && [[ -f pnpm-lock.yaml ]]; then
      printf 'pnpm test'
    elif [[ -f yarn.lock ]]; then
      printf 'yarn test'
    else
      printf 'npm test --silent'
    fi
  elif [[ -f Cargo.toml ]]; then
    printf 'cargo test --quiet'
  elif [[ -f go.mod ]]; then
    printf 'go test ./...'
  elif [[ -f pyproject.toml || -f pytest.ini || -d tests ]]; then
    if command -v uv >/dev/null 2>&1 && [[ -f uv.lock ]]; then
      printf 'uv run pytest -q'
    else
      printf 'pytest -q'
    fi
  else
    return 1
  fi
}

runner="$(detect_runner)" || {
  echo "no test runner detected (package.json / Cargo.toml / go.mod / pyproject.toml)" >&2
  exit 2
}

out="$(mktemp)"
trap 'rm -f "$out"' EXIT

status=0
# shellcheck disable=SC2086
if [[ "${#extra[@]}" -gt 0 ]]; then
  $runner "${extra[@]}" >"$out" 2>&1 || status=$?
else
  $runner >"$out" 2>&1 || status=$?
fi

summary="$(grep -Ei '([0-9]+ (passed|failed|passing|failing|ok))|^(FAIL|PASS|ok|test result)' "$out" | tail -n 3 || true)"

if [[ "$status" -eq 0 ]]; then
  printf 'PASS (%s)%s\n' "$runner" "${summary:+ — $(printf '%s' "$summary" | tr '\n' ';')}"
  exit 0
fi

printf 'FAIL (%s) exit=%d\n' "$runner" "$status"
[[ -n "$summary" ]] && printf '%s\n' "$summary"

failing="$(grep -Ei '^\s*(FAIL|✕|✗|●|FAILED|--- FAIL|thread .* panicked)' "$out" | head -n "$max_lines" || true)"
if [[ -n "$failing" ]]; then
  printf -- '--- failing ---\n%s\n' "$failing"
else
  printf -- '--- tail ---\n'
  tail -n "$max_lines" "$out"
fi
printf -- '(full output suppressed; re-run `%s` directly if needed)\n' "$runner"
exit "$status"
