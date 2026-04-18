import hashlib
import uuid


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


# ─── Convenience wrappers used by repositories/services ──────
def canonical_id(tenant_id: str, entity_type: str, external_key: str) -> str:
    """Deterministic canonical ID from tenant + type + external key."""
    base = f"{tenant_id}:{entity_type}:{external_key}"
    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()[:24]
    return f"obj_{digest}"


def event_id() -> str:
    return new_id("evt")


def lineage_id() -> str:
    return new_id("lin")


def workflow_instance_id() -> str:
    return new_id("wfi")


def alert_id() -> str:
    return new_id("alrt")


def action_id() -> str:
    return new_id("act")


def audit_id() -> str:
    return new_id("aud")
