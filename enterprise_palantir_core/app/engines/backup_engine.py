"""
Backup Engine — full tenant snapshots written to a backup directory.

Features:
  - Full tenant backup to a single JSON file
  - Timestamped filenames so multiple backups accumulate
  - Optional gzip compression
  - Backup metadata: tenant_id, timestamp, row counts, sha256
  - Restore from backup to a fresh DB
  - Retention policy: keep last N backups per tenant

The backup format is the same JSON produced by ExportEngine.export_tenant_json
so restore is just "ingest every record in the dump".
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.engines.export_engine import ExportEngine
from app.schemas.ingest import IngestRecordIn
from app.services.ingestion_service import IngestionService


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class BackupMetadata:
    tenant_id: str
    created_at: datetime
    filename: str
    path: str
    compressed: bool
    sha256: str
    size_bytes: int
    object_count: int
    event_count: int
    state_count: int
    audit_count: int


@dataclass
class RestoreResult:
    tenant_id: str
    restored_at: datetime
    objects_restored: int
    events_restored: int
    errors: List[str] = field(default_factory=list)


class BackupEngine:
    def __init__(self, db: Session, backup_dir: str = "./backups") -> None:
        self.db = db
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    # ─── Create a backup ─────────────────────────────────────
    def create_backup(
        self,
        tenant_id: str,
        *,
        compressed: bool = True,
    ) -> BackupMetadata:
        export_engine = ExportEngine(self.db)
        dump = export_engine.export_tenant_json(tenant_id)

        timestamp = utc_now().strftime("%Y%m%d_%H%M%S")
        suffix = ".json.gz" if compressed else ".json"
        filename = f"{tenant_id}_{timestamp}{suffix}"
        path = self.backup_dir / filename

        serialized = json.dumps(dump, ensure_ascii=False, default=str).encode("utf-8")
        sha = hashlib.sha256(serialized).hexdigest()

        if compressed:
            with gzip.open(path, "wb") as fp:
                fp.write(serialized)
        else:
            with open(path, "wb") as fp:
                fp.write(serialized)

        size_bytes = path.stat().st_size

        return BackupMetadata(
            tenant_id=tenant_id,
            created_at=utc_now(),
            filename=filename,
            path=str(path),
            compressed=compressed,
            sha256=sha,
            size_bytes=size_bytes,
            object_count=dump["counts"]["objects"],
            event_count=dump["counts"]["events"],
            state_count=dump["counts"]["states"],
            audit_count=dump["counts"]["audit"],
        )

    # ─── Restore from a backup ───────────────────────────────
    def restore_backup(self, filename: str) -> RestoreResult:
        path = self.backup_dir / filename
        if not path.exists():
            return RestoreResult(
                tenant_id="",
                restored_at=utc_now(),
                objects_restored=0,
                events_restored=0,
                errors=[f"backup file not found: {filename}"],
            )

        if filename.endswith(".gz"):
            with gzip.open(path, "rb") as fp:
                raw = fp.read()
        else:
            with open(path, "rb") as fp:
                raw = fp.read()

        try:
            dump = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            return RestoreResult(
                tenant_id="",
                restored_at=utc_now(),
                objects_restored=0,
                events_restored=0,
                errors=[f"failed to parse backup: {exc}"],
            )

        tenant_id = dump.get("tenant_id", "unknown")
        objects_restored = 0
        errors: List[str] = []

        service = IngestionService(self.db)

        # Rehydrate each object as a fresh ingestion record
        for obj in dump.get("objects", []):
            try:
                record = IngestRecordIn(
                    tenant_id=obj["tenant_id"],
                    source_system="backup_restore",
                    source_record_id=obj["id"],
                    entity_type=obj["object_type"],
                    entity_name=obj["name"],
                    canonical_external_key=obj.get("canonical_external_key"),
                    event_type="entity_upserted",
                    severity="info",
                    properties=obj.get("properties", {}),
                    relationships=obj.get("relationships", {}),
                )
                service.ingest_record(record)
                objects_restored += 1
            except Exception as exc:
                errors.append(f"object {obj.get('id')}: {exc}")

        return RestoreResult(
            tenant_id=tenant_id,
            restored_at=utc_now(),
            objects_restored=objects_restored,
            events_restored=0,  # we only re-ingest objects; events are rebuilt as side-effects
            errors=errors,
        )

    # ─── List backups ────────────────────────────────────────
    def list_backups(self, tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
        files = sorted(self.backup_dir.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
        out: List[Dict[str, Any]] = []
        for path in files:
            if not path.is_file():
                continue
            if tenant_id and not path.name.startswith(tenant_id + "_"):
                continue
            stat = path.stat()
            out.append({
                "filename": path.name,
                "path": str(path),
                "size_bytes": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "compressed": path.name.endswith(".gz"),
            })
        return out

    # ─── Retention (keep last N per tenant) ──────────────────
    def apply_retention(self, tenant_id: str, keep: int = 7) -> Dict[str, Any]:
        backups = [
            b for b in self.list_backups(tenant_id)
            if b["filename"].startswith(tenant_id + "_")
        ]
        # Already sorted newest first by list_backups
        to_delete = backups[keep:]
        deleted: List[str] = []
        for b in to_delete:
            try:
                os.remove(b["path"])
                deleted.append(b["filename"])
            except Exception:
                pass
        return {
            "tenant_id": tenant_id,
            "kept": len(backups) - len(deleted),
            "deleted": deleted,
        }
