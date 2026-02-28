#!/usr/bin/env bash
set -euo pipefail

# Set proxy environment for all child processes
export HTTPS_PROXY=http://localhost:8080
export HTTP_PROXY=http://localhost:8080
export NODE_EXTRA_CA_CERTS=/app/proxy/ca.crt
export REQUESTS_CA_BUNDLE=/app/proxy/ca.crt
export SSL_CERT_FILE=/app/proxy/ca.crt

if [ -z "${AGENT_COMMAND:-}" ]; then
  # ── Proxy-only (sidecar) mode ──────────────────────────────────────
  # SDK drives agent externally; we just run the proxy and wait for /attestation/done

  PROXY_NONCE="${PROXY_NONCE:-}" \
  IMAGE_DIGEST="${IMAGE_DIGEST:-sha256:unknown}" \
  ATTESTATION_DIR="${ATTESTATION_DIR:-/attestation}" \
  node /app/proxy/dist/index.js

else
  # ── Full mode ──────────────────────────────────────────────────────
  # Download workspace, run agent, signal proxy to finalize

  WORKSPACE_URL="${WORKSPACE_URL:?WORKSPACE_URL must be set in full mode}"
  ATTESTATION_DIR="${ATTESTATION_DIR:-/attestation}"

  mkdir -p /workspace "$ATTESTATION_DIR"

  echo "[entrypoint] Downloading workspace..."
  curl -fsSL -o /tmp/workspace.tar.gz "$WORKSPACE_URL"
  tar -xzf /tmp/workspace.tar.gz -C /workspace

  # Optional setup script
  if [ -f /workspace/setup.sh ]; then
    echo "[entrypoint] Running setup.sh..."
    bash /workspace/setup.sh
  fi

  # Start proxy
  echo "[entrypoint] Starting proxy..."
  PROXY_NONCE="${PROXY_NONCE:-}" \
  IMAGE_DIGEST="${IMAGE_DIGEST:-sha256:unknown}" \
  ATTESTATION_DIR="$ATTESTATION_DIR" \
  node /app/proxy/dist/index.js &
  PROXY_PID=$!

  # Give proxy a moment to start
  sleep 1

  # Run agent in workspace directory
  echo "[entrypoint] Running agent: $AGENT_COMMAND"
  cd /workspace
  eval "$AGENT_COMMAND" || true

  # Signal proxy to finalize
  echo "[entrypoint] Agent done. Signaling proxy..."
  touch "$ATTESTATION_DIR/done"

  # Wait for proxy to finish writing attestation
  wait $PROXY_PID || true

  echo "[entrypoint] Complete."
fi
