#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  stop-all.sh — Linux/Mac graceful shutdown for the mega ERP
#  Author:  Agent-33 (ops swarm)
#  Related: OPS_RUNBOOK.md section 3.2
#
#  Reads PID files from scripts/pids/*.pid and sends SIGTERM to each
#  service's process group (services were launched with setsid so
#  each has its own pgid).
#
#  A 30-second grace window per service lets Node flush pino logs,
#  drain Express, close pg pools, and (for onyx-ai) close the
#  append-only event log cleanly.
#
#  SIGKILL is ONLY used if a service ignored SIGTERM for 30 seconds
#  — never as the first action.
#
#  Usage:
#     ./scripts/stop-all.sh
#     ./scripts/stop-all.sh --force   # skip grace window, SIGKILL now
# ══════════════════════════════════════════════════════════════════

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/pids"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
    FORCE=1
fi

if [[ ! -d "$PID_DIR" ]]; then
    echo "[info] no pid directory at $PID_DIR — nothing to stop."
    exit 0
fi

echo
echo "============================================================"
echo " Techno-Kol mega ERP — graceful stop"
echo "============================================================"
echo

stop_one() {
    local svc="$1"
    local pidfile="$PID_DIR/$svc.pid"

    if [[ ! -f "$pidfile" ]]; then
        echo "[skip] $svc — no pid file"
        return 0
    fi

    local pid
    pid="$(cat "$pidfile" 2>/dev/null || true)"

    if [[ -z "$pid" ]]; then
        echo "[skip] $svc — empty pid file"
        rm -f "$pidfile"
        return 0
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
        echo "[gone] $svc pid=$pid already exited"
        rm -f "$pidfile"
        return 0
    fi

    # Prefer process-group kill (negated pid) — start-all.sh uses
    # setsid so pid == pgid. Fall back to plain pid if that fails.
    if (( FORCE == 1 )); then
        echo "[FORCE] $svc pid=$pid — SIGKILL now"
        kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
        rm -f "$pidfile"
        return 0
    fi

    echo "[term] $svc pid=$pid — SIGTERM"
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true

    # Grace window: poll up to 30 seconds.
    local i
    for (( i=0; i<30; i++ )); do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "       $svc exited after ${i}s"
            rm -f "$pidfile"
            return 0
        fi
        sleep 1
    done

    echo "[warn] $svc pid=$pid still alive after 30s — escalating to SIGKILL"
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    rm -f "$pidfile"
}

# Stop in REVERSE dependency order: dependents first, upstream last.
stop_one AI-Task-Manager
stop_one techno-kol-ops
stop_one onyx-ai
stop_one onyx-procurement

echo
echo "[done] all services signalled."
echo
