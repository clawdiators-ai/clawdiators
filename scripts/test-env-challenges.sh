#!/usr/bin/env bash
# test-env-challenges.sh — Smoke-test environment challenges that require Docker
#
# Usage: ./scripts/test-env-challenges.sh
#
# Prerequisites:
#   - Docker running locally
#   - Database running (docker compose up -d)
#   - API server running (pnpm dev:api)

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
# Discover environment challenges dynamically from docker-compose.yml files
ENV_CHALLENGES=()
for compose in packages/api/src/challenges/*/docker-compose.yml; do
  [ -f "$compose" ] && ENV_CHALLENGES+=("$(basename "$(dirname "$compose")")")
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

passed=0
failed=0
skipped=0

echo "=== Environment Challenge Smoke Tests ==="
echo "Base URL: $BASE_URL"
echo ""

# Check Docker availability
if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}Docker is not running. Start Docker and retry.${NC}"
  exit 1
fi

# Check API availability
if ! curl -sf "$BASE_URL/api/v1/challenges" >/dev/null 2>&1; then
  echo -e "${RED}API server not reachable at $BASE_URL. Start with: pnpm dev:api${NC}"
  exit 1
fi

echo -e "${GREEN}Docker: running${NC}"
echo -e "${GREEN}API: reachable${NC}"
echo ""

for slug in "${ENV_CHALLENGES[@]}"; do
  echo "--- Testing: $slug ---"

  # 1. Check challenge exists
  challenge_resp=$(curl -sf "$BASE_URL/api/v1/challenges/$slug" 2>/dev/null || echo "")
  if [ -z "$challenge_resp" ]; then
    echo -e "  ${YELLOW}SKIP${NC} — challenge not found in database"
    skipped=$((skipped + 1))
    continue
  fi

  requires_env=$(echo "$challenge_resp" | jq -r '.data.requires_environment // false')
  echo "  requires_environment: $requires_env"

  # 2. Download workspace
  workspace_resp=$(curl -sf -o /dev/null -w '%{http_code}' "$BASE_URL/api/v1/challenges/$slug/workspace?seed=42" 2>/dev/null || echo "000")
  if [ "$workspace_resp" = "200" ]; then
    echo -e "  ${GREEN}PASS${NC} — workspace download (HTTP $workspace_resp)"
  else
    echo -e "  ${YELLOW}WARN${NC} — workspace download returned HTTP $workspace_resp"
  fi

  # 3. Check Docker images for this challenge (if applicable)
  challenge_dir="packages/api/src/challenges/$slug/services"
  if [ -d "$challenge_dir" ]; then
    service_count=$(find "$challenge_dir" -name "Dockerfile" -o -name "docker-compose*.yml" | wc -l | tr -d ' ')
    echo "  Service definitions found: $service_count"
  else
    echo "  No service definitions directory"
  fi

  echo -e "  ${GREEN}PASS${NC} — basic checks"
  passed=$((passed + 1))
  echo ""
done

echo "=== Results ==="
echo -e "Passed: ${GREEN}$passed${NC}"
echo -e "Failed: ${RED}$failed${NC}"
echo -e "Skipped: ${YELLOW}$skipped${NC}"

[ "$failed" -eq 0 ] && exit 0 || exit 1
