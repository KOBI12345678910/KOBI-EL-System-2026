from __future__ import annotations

from enum import Enum


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


class FreshnessStatus(str, Enum):
    FRESH = "fresh"
    STALE = "stale"
    UNKNOWN = "unknown"


class EntityStatus(str, Enum):
    ACTIVE = "active"
    AT_RISK = "at_risk"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class EventType(str, Enum):
    ENTITY_UPSERTED = "entity_upserted"
    STATUS_CHANGED = "status_changed"
    PROPERTY_UPDATED = "property_updated"
    RELATIONSHIP_CREATED = "relationship_created"
    RELATIONSHIP_REMOVED = "relationship_removed"
    ALERT_CREATED = "alert_created"
    ALERT_RESOLVED = "alert_resolved"
    WORKFLOW_STARTED = "workflow_started"
    WORKFLOW_TRANSITIONED = "workflow_transitioned"
    WORKFLOW_COMPLETED = "workflow_completed"
    WORKFLOW_STALLED = "workflow_stalled"
    INVENTORY_LOW = "inventory_low"
    SUPPLIER_DELAYED = "supplier_delayed"
    PAYMENT_RECEIVED = "payment_received"
    PROJECT_AT_RISK = "project_at_risk"
    ACTION_REQUESTED = "action_requested"
    ACTION_APPROVED = "action_approved"
    ACTION_EXECUTED = "action_executed"
    ACTION_REJECTED = "action_rejected"
    CUSTOM = "custom"


class WorkflowInstanceStatus(str, Enum):
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AlertStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    SUPPRESSED = "suppressed"


class ActionStatus(str, Enum):
    REQUESTED = "requested"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTING = "executing"
    EXECUTED = "executed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class Permission(str, Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    ADMIN = "admin"
    EXECUTE_ACTION = "execute_action"
    APPROVE_ACTION = "approve_action"
    VIEW_AUDIT = "view_audit"
    MANAGE_WORKFLOWS = "manage_workflows"
    MANAGE_SCHEMAS = "manage_schemas"
    MANAGE_TENANTS = "manage_tenants"


class IngestionMode(str, Enum):
    BATCH = "batch"
    INCREMENTAL = "incremental"
    CDC = "cdc"
    STREAM = "stream"
    WEBHOOK = "webhook"
    FILE_DROP = "file_drop"
