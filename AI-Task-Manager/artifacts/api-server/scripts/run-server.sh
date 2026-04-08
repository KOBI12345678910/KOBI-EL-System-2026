#!/usr/bin/env bash
# Auto-restart wrapper for the API server.
# On crash (non-zero exit that is NOT a clean SIGTERM/SIGINT), waits with
# exponential backoff (5s → 10s → 20s → 40s → max 60s) then restarts.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

MAX_BACKOFF=60
STABLE_UPTIME_SECS=300
backoff=5
attempt=0

log() {
  local msg="$1"
  local extra="${2:-}"
  if [ -n "$extra" ]; then
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"info\",\"message\":\"$msg\",$extra}"
  else
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"info\",\"message\":\"$msg\"}"
  fi
}

log "server_wrapper_start" "\"node_memory_limit_mb\": 256"

# Determine whether to run compiled JS or tsx source.
# In non-development environments, the artifact build step produces dist/index.cjs first.
# In development, tsx is used directly for fast iteration.
DIST_FILE="$SERVER_DIR/dist/index.cjs"

# When a compiled dist bundle exists, default NODE_ENV to "production" so the
# SPA catch-all route and other production-only middleware activate correctly.
# Explicitly setting NODE_ENV=development in the environment overrides this
# and forces tsx (source) mode regardless of whether a dist bundle is present.
if [ "${NODE_ENV:-}" = "development" ]; then
  # Forced development mode — always use tsx source regardless of dist bundle.
  RESOLVED_NODE_ENV="development"
  DIST_FILE=""
  log "server_mode_tsx" "\"node_env\": \"$RESOLVED_NODE_ENV\""
elif [ -f "$DIST_FILE" ]; then
  # Compiled bundle present — default to production.
  RESOLVED_NODE_ENV="${NODE_ENV:-production}"
  log "server_mode_compiled" "\"node_env\": \"$RESOLVED_NODE_ENV\", \"dist\": \"$DIST_FILE\""
else
  # No compiled bundle — development/tsx mode.
  RESOLVED_NODE_ENV="${NODE_ENV:-development}"
  DIST_FILE=""
  log "server_mode_tsx" "\"node_env\": \"$RESOLVED_NODE_ENV\""
fi

while true; do
  attempt=$((attempt + 1))
  log "server_start_attempt" "\"attempt\": $attempt"

  start_time=$(date +%s)

  if [ -f "$SCRIPT_DIR/guard-mfa.sh" ]; then
    bash "$SCRIPT_DIR/guard-mfa.sh" || echo "Warning: MFA guard failed"
  fi

  set +e
  (
    cd "$SERVER_DIR"
    export NODE_ENV="$RESOLVED_NODE_ENV"
    export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=256}"
    if [ -n "$DIST_FILE" ] && [ -f "$DIST_FILE" ]; then
      exec node "$DIST_FILE"
    else
      exec pnpm exec tsx ./src/index.ts
    fi
  )
  EXIT_CODE=$?
  set -e

  # Exit codes for clean signals: SIGTERM=143, SIGINT=130, explicit exit 0
  if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 130 ] || [ "$EXIT_CODE" -eq 143 ]; then
    log "server_clean_exit" "\"exit_code\": $EXIT_CODE"
    exit 0
  fi

  # Reset backoff if server ran stably for long enough
  uptime=$(( $(date +%s) - start_time ))
  if [ "$uptime" -ge "$STABLE_UPTIME_SECS" ]; then
    backoff=5
    attempt=0
    log "server_backoff_reset" "\"uptime_seconds\": $uptime"
  fi

  # Dump memory stats for post-crash analysis
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"warn\",\"message\":\"server_crashed_restarting\",\"exit_code\": $EXIT_CODE,\"backoff_seconds\": $backoff,\"attempt\": $attempt,\"uptime_seconds\": $uptime}"
  if [ -f /proc/meminfo ]; then
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"warn\",\"message\":\"meminfo_at_crash\",\"meminfo\":\"$(grep -E '^(MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree)' /proc/meminfo | tr '\n' '|' | sed 's/|$//')\"}"
  fi

  sleep "$backoff"

  # Exponential backoff capped at MAX_BACKOFF
  backoff=$(( backoff * 2 ))
  if [ "$backoff" -gt "$MAX_BACKOFF" ]; then
    backoff=$MAX_BACKOFF
  fi
done
