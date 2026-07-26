#!/usr/bin/env bash
# Stop hook: build every Raycast extension that has uncommitted changes.
#
# `ray build` defaults to `-e dev`, whose output directory is
# ~/.config/raycast/extensions/<name>/ -- so building IS deploying to the
# local Raycast app. Running this on Stop keeps the installed extensions in
# sync with the working tree without a manual build step.
set -uo pipefail

input=$(cat)

# Guard against build-fails -> Claude retries -> Stop hook -> build-fails loops.
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}" 2>/dev/null || exit 0

# Extension directory names with modified/untracked files under extensions/.
exts=$(git status --porcelain -- extensions | sed 's/^...//' | cut -d/ -f2 | sort -u)
[ -n "$exts" ] || exit 0

rc=0
built=""
while IFS= read -r ext; do
  [ -n "$ext" ] || continue
  dir="extensions/$ext"
  [ -f "$dir/package.json" ] || continue
  if [ ! -d "$dir/node_modules" ]; then
    printf 'skipped %s: node_modules is missing, run `npm install` in %s\n' "$ext" "$dir" >&2
    continue
  fi
  if out=$(cd "$dir" && npx ray build -e dev 2>&1); then
    built="$built${built:+, }$ext"
  else
    printf '%s: `ray build` failed, so the working tree is NOT deployed to Raycast.\n%s\n' "$ext" "$out" >&2
    rc=2
  fi
done <<<"$exts"

[ -z "$built" ] || printf '{"systemMessage":"Raycast へデプロイしました: %s"}\n' "$built"
exit $rc
