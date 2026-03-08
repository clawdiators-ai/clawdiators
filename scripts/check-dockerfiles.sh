#!/bin/bash
# check-dockerfiles.sh — Validate that Dockerfile COPY sources exist and aren't gitignored.
#
# Catches the class of bug where a COPY references a path that only exists on the
# author's machine (e.g. a gitignored data/ directory). Runs in CI without Docker.
#
# Only checks Dockerfiles that use their own directory as build context:
#   - services/*/ (auto-discovered via .image files)
#   - docker/eval-*/ (evaluation runtime images)
#   - packages/*/services/*/ (challenge service images)

set -euo pipefail

errfile=$(mktemp)
echo 0 > "$errfile"

# Collect directories to check
dirs=()
for imagefile in services/*/.image; do
  [ -f "$imagefile" ] && dirs+=("$(dirname "$imagefile")")
done
for d in docker/eval-*/; do
  [ -f "$d/Dockerfile" ] && dirs+=("${d%/}")
done
for d in packages/api/src/challenges/*/services/*/; do
  [ -f "${d}Dockerfile" ] && dirs+=("${d%/}")
done

for ctx_dir in "${dirs[@]}"; do
  dockerfile="$ctx_dir/Dockerfile"
  [ -f "$dockerfile" ] || continue

  # Extract COPY source paths (skip --from= multi-stage copies)
  while IFS= read -r line; do
    # Strip COPY keyword and any --flags
    args=$(echo "$line" | sed 's/^\s*COPY\s*//' | sed 's/--[a-z]*=[^ ]* *//g')
    # Last arg is destination, everything else is source
    sources=$(echo "$args" | awk '{for(i=1;i<NF;i++) print $i}')

    for src in $sources; do
      # Skip absolute paths, URLs, and current dir references
      [[ "$src" == /* || "$src" == http* || "$src" == "." || "$src" == "./" ]] && continue

      full_path="$ctx_dir/$src"
      check_path="${full_path%/}"

      # Check if gitignored (catches paths that exist locally but won't be in the repo)
      if git check-ignore -q "$check_path" 2>/dev/null; then
        echo "ERROR: $dockerfile: COPY source '$src' is gitignored — it won't exist in a clean checkout"
        echo $(( $(cat "$errfile") + 1 )) > "$errfile"
      elif [ ! -e "$check_path" ]; then
        echo "ERROR: $dockerfile: COPY source '$src' does not exist (resolved to $check_path)"
        echo $(( $(cat "$errfile") + 1 )) > "$errfile"
      fi
    done
  done < <(grep -E '^\s*COPY\s' "$dockerfile" | grep -v -- '--from=' || true)
done

errors=$(cat "$errfile")
rm -f "$errfile"

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "Found $errors Dockerfile COPY error(s)."
  echo "Fix: use RUN to generate data at build time, or remove the path from .gitignore."
  exit 1
fi

echo "All Dockerfile COPY sources verified."
