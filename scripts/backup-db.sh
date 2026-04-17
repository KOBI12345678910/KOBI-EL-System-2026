#!/bin/bash
# ═══════════════════════════════════════════════════════
# backup-db.sh — Backup Supabase / PostgreSQL database
# Usage: bash scripts/backup-db.sh
# Requires: DATABASE_URL env var or .env.production file
# ═══════════════════════════════════════════════════════
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Load env if available
if [ -f ".env.production" ]; then
  # shellcheck disable=SC1091
  export $(grep -v '^#' .env.production | xargs)
elif [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Starting backup $DATE..."

if command -v pg_dump &> /dev/null; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set. Export it or add it to .env.production"
    exit 1
  fi
  pg_dump "$DATABASE_URL" > "$BACKUP_DIR/backup_$DATE.sql"
  gzip "$BACKUP_DIR/backup_$DATE.sql"
  echo "Backup saved: $BACKUP_DIR/backup_$DATE.sql.gz"
else
  echo "WARNING: pg_dump not found. Use Supabase dashboard to download backup."
  echo "   https://supabase.com/dashboard/project/YOUR_PROJECT/database/backups"
fi

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
echo "Done. Backup count: $(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)"
