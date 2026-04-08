#!/usr/bin/env bash
# Backup the PostgreSQL database using pg_dump.
# Saves timestamped files under backups/ and retains only the 24 most recent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$(dirname "$SCRIPT_DIR")/backups"
KEEP=24

log() {
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"info\",\"message\":\"$1\"${2:+,\"detail\":\"$2\"}}"
}

if [ -z "${DATABASE_URL:-}" ]; then
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"error\",\"message\":\"backup_failed\",\"reason\":\"DATABASE_URL not set\"}"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

log "db_backup_start" "$BACKUP_FILE"

if pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "db_backup_complete" "file=$BACKUP_FILE size=$SIZE"
else
  log_err="{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"error\",\"message\":\"db_backup_failed\",\"file\":\"$BACKUP_FILE\"}"
  echo "$log_err"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Prune: keep only the $KEEP most recent backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$KEEP" ]; then
  DELETE_COUNT=$(( BACKUP_COUNT - KEEP ))
  ls -1t "$BACKUP_DIR"/backup_*.sql.gz | tail -n "$DELETE_COUNT" | xargs rm -f
  log "db_backup_pruned" "deleted=$DELETE_COUNT kept=$KEEP"
fi

log "db_backup_done" "total=$(ls -1 "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | wc -l) kept_max=$KEEP"
