#!/usr/bin/env bash
# Restore the PostgreSQL database from a backup file.
# Usage:
#   ./restore-db.sh <backup_file>
#   ./restore-db.sh          (restores the most recent backup automatically)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$(dirname "$SCRIPT_DIR")/backups"

log() {
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"info\",\"message\":\"$1\"${2:+,\"detail\":\"$2\"}}"
}

if [ -z "${DATABASE_URL:-}" ]; then
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"error\",\"message\":\"restore_failed\",\"reason\":\"DATABASE_URL not set\"}"
  exit 1
fi

if [ -n "${1:-}" ]; then
  BACKUP_FILE="$1"
else
  # Pick the most recent backup automatically
  BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | head -n 1 || true)"
  if [ -z "$BACKUP_FILE" ]; then
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"error\",\"message\":\"restore_failed\",\"reason\":\"No backup files found in $BACKUP_DIR\"}"
    exit 1
  fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"error\",\"message\":\"restore_failed\",\"reason\":\"File not found: $BACKUP_FILE\"}"
  exit 1
fi

log "db_restore_start" "file=$BACKUP_FILE"

echo "WARNING: This will overwrite the current database. Press Ctrl+C within 5 seconds to cancel."
sleep 5

if gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"; then
  log "db_restore_complete" "file=$BACKUP_FILE"
else
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"error\",\"message\":\"db_restore_failed\",\"file\":\"$BACKUP_FILE\"}"
  exit 1
fi
