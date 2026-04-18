#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

MFA_FILE="$SERVER_DIR/src/lib/mfa.ts"
MFA_BACKUP="$SCRIPT_DIR/mfa.backup.ts"

echo "[MFA Guard] Checking integrity of $MFA_FILE..."

if [ ! -f "$MFA_FILE" ]; then
  echo "[MFA Guard] ERROR: $MFA_FILE does not exist!"
  if [ -f "$MFA_BACKUP" ]; then
    echo "[MFA Guard] Restoring from backup..."
    cp "$MFA_BACKUP" "$MFA_FILE"
    echo "[MFA Guard] Restored from backup"
  else
    echo "[MFA Guard] ERROR: No backup available!"
    exit 1
  fi
fi

if ! head -1 "$MFA_FILE" | grep -q "import"; then
  echo "[MFA Guard] CORRUPTION DETECTED! File doesn't start with import"
  
  if [ -f "$MFA_BACKUP" ]; then
    echo "[MFA Guard] Restoring from backup..."
    cp "$MFA_BACKUP" "$MFA_FILE"
    echo "[MFA Guard] Restored from backup"
  else
    echo "[MFA Guard] ERROR: No backup available. Attempting git restore..."
    cd "$SERVER_DIR"
    git restore src/lib/mfa.ts || exit 1
  fi
fi

cp "$MFA_FILE" "$MFA_BACKUP"
echo "[MFA Guard] ✓ mfa.ts is healthy. Backup updated."
