#!/usr/bin/env bash
# Run the same command inside every extension directory.
#
# The repository is not an npm workspace -- each extensions/<name>/ is its own
# project -- so anything repo-wide has to loop. This is that loop, shared by
# mise tasks, the pre-commit hook and CI.
#
# Usage:
#   scripts/each-extension.sh npm run lint              # every extension
#   scripts/each-extension.sh --allow-missing-deps npm install
#   EXTENSIONS="ghq slack-operator" scripts/each-extension.sh npm run lint
#
# Extensions without node_modules are reported as failures rather than run,
# since npm scripts there fail in confusing ways; pass --allow-missing-deps for
# the install task itself. The command runs everywhere before the script exits,
# so one broken extension does not hide the others' results.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

require_deps=1
if [ "${1:-}" = "--allow-missing-deps" ]; then
  require_deps=0
  shift
fi

[ $# -gt 0 ] || {
  printf 'usage: %s [--allow-missing-deps] <command> [args...]\n' "$0" >&2
  exit 64
}

exts=${EXTENSIONS:-$(ls extensions)}
[ -n "$exts" ] || exit 0

rc=0
failed=""
for ext in $exts; do
  dir="extensions/$ext"
  [ -f "$dir/package.json" ] || continue
  if [ "$require_deps" = 1 ] && [ ! -d "$dir/node_modules" ]; then
    printf '\n=== %s: skipped, node_modules is missing (run `mise run install`) ===\n' "$ext" >&2
    rc=1
    failed="$failed${failed:+, }$ext"
    continue
  fi
  printf '\n=== %s: %s ===\n' "$ext" "$*"
  if ! (cd "$dir" && "$@"); then
    rc=1
    failed="$failed${failed:+, }$ext"
  fi
done

[ -z "$failed" ] || printf '\nfailed in: %s\n' "$failed" >&2
exit $rc
