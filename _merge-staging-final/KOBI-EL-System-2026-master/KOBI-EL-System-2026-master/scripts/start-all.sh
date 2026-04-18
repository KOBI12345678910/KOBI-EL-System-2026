#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  start-all.sh — Linux/Mac launcher for the Techno-Kol mega ERP
#  Author:  Agent-33 (ops swarm)
#  Related: OPS_RUNBOOK.md section 2.2
#
#  Starts every long-running service in the background, redirects
#  stdout/stderr to scripts/logs/<service>.out/.err, writes PID files
#  to scripts/pids/<service>.pid, and installs a trap so that
#  Ctrl-C in this shell fires a graceful stop-all.sh.
#
#  Usage:
#     cd "/path/to/מערכת 2026  KOBI EL"
#     ./scripts/start-all.sh
#
#  Notes:
#    * We use `setsid` so each service gets its own process group,
#      which lets stop-all.sh kill the whole tree with a single
#      negated PID (`kill -TERM -$pgid`).
#    * We do NOT use `&` + `disown` — we want the parent shell to
#      know about the children so the trap works.
# ══════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$SCRIPT_DIR/pids"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

echo
echo "============================================================"
echo " Techno-Kol mega ERP — starting all services"
echo " Root: $ROOT"
echo "============================================================"
echo

# ─── Preflight ────────────────────────────────────────────────────
missing=()
for svc in onyx-procurement onyx-ai techno-kol-ops AI-Task-Manager; do
    if [[ ! -f "$ROOT/$svc/.env" ]]; then
        missing+=("$svc")
    fi
done

if (( ${#missing[@]} > 0 )); then
    echo "[ERROR] Missing .env file(s) for: ${missing[*]}"
    echo "        Copy .env.example to .env in each project and fill in values."
    echo "        Aborting start-all."
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] node not found on PATH. Install Node.js >= 20."
    exit 1
fi

# ─── Bookkeeping ──────────────────────────────────────────────────
CHILDREN=()      # array of "svc:pid:pgid"

start_service() {
    # $1 = service name (matches directory)
    # $2 = command to run inside the service dir
    # $3 = label (e.g. "ONYX-PROCUREMENT :3100")
    local svc="$1"
    local cmd="$2"
    local label="$3"
    local out="$LOG_DIR/$svc.out"
    local err="$LOG_DIR/$svc.err"
    local pidfile="$PID_DIR/$svc.pid"

    echo "[start] $label"
    # Use setsid to put the child in its own session / process group.
    # `sh -c` lets us compose the cd + command in one line so the
    # process group is rooted at the command itself.
    setsid bash -c "cd '$ROOT/$svc' && exec $cmd" \
        >"$out" 2>"$err" &
    local pid=$!
    # pgid == pid when setsid is used
    echo "$pid" > "$pidfile"
    CHILDREN+=("$svc:$pid:$pid")
    echo "        pid=$pid  logs: $out / $err"
    # small cushion between services so dependents see upstream ready
    sleep 3
}

# ─── Graceful shutdown trap ───────────────────────────────────────
shutdown() {
    local rc=$?
    echo
    echo "[trap] caught signal — delegating to stop-all.sh"
    trap '' INT TERM
    if [[ -x "$SCRIPT_DIR/stop-all.sh" ]]; then
        "$SCRIPT_DIR/stop-all.sh" || true
    else
        # Inline fallback if stop-all.sh is missing.
        for entry in "${CHILDREN[@]}"; do
            local svc="${entry%%:*}"
            local rest="${entry#*:}"
            local pid="${rest%%:*}"
            local pgid="${rest##*:}"
            echo "  [stop] $svc pgid=$pgid"
            kill -TERM "-$pgid" 2>/dev/null || true
        done
    fi
    exit $rc
}
trap shutdown INT TERM

# ─── Launch in dependency order ───────────────────────────────────
start_service "onyx-procurement"  "npm start"                               "ONYX-PROCUREMENT :3100"
start_service "onyx-ai"           "npm start"                               "ONYX-AI :3200"
start_service "techno-kol-ops"    "npm start"                               "TECHNO-KOL-OPS :5000"
start_service "AI-Task-Manager"   "pnpm -r --if-present --parallel run start" "AI-TASK-MANAGER :8080"

echo
echo "============================================================"
echo " All services launched. PID files in: $PID_DIR"
echo " Logs: $LOG_DIR"
echo " Ctrl-C here for graceful shutdown (runs stop-all.sh)."
echo " Or run: ./scripts/stop-all.sh  from another shell."
echo "============================================================"
echo

# ─── Wait for first child to exit ─────────────────────────────────
# If any service crashes, we print a warning but keep the others
# up so the operator can investigate from the logs. Use stop-all.sh
# to bring everything down cleanly.
while true; do
    for entry in "${CHILDREN[@]}"; do
        local svc="${entry%%:*}"
        local pid="${entry#*:}"
        pid="${pid%%:*}"
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "[warn] $svc (pid $pid) exited. See $LOG_DIR/$svc.err"
            # remove from the list so we don't spam
            CHILDREN=("${CHILDREN[@]/$entry}")
        fi
    done
    sleep 10
done
