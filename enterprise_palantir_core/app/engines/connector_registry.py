"""
Connector Registry — the authoritative list of every external data
source the platform is aware of.

Each Connector is a descriptor + a health record:
  - who owns it (tenant, team)
  - what it produces (which canonical entity types)
  - how it's ingested (push webhook / poll / CDC / file drop / stream)
  - auth mechanism (api_key / oauth / basic / mtls / none)
  - its health (last_sync, last_error, events_per_minute, status)
  - its schedule (cron expression, for poll-based connectors)

The registry is persisted in-memory at runtime. A future revision can
back it with a DB table (the schema is designed to be migration-friendly).

Downstream consumers:
  - /command-center/{tenant}/connectors    — health dashboard
  - CDCManager uses the registry to know which sources to poll
  - The automation scheduler reads the registry to figure out what to
    run on which interval
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ConnectorType(str, Enum):
    POSTGRES = "postgres"
    MYSQL = "mysql"
    MSSQL = "mssql"
    ORACLE = "oracle"
    MONGODB = "mongodb"
    REST_API = "rest_api"
    GRAPHQL = "graphql"
    WEBHOOK = "webhook"
    FILE_DROP = "file_drop"
    SFTP = "sftp"
    S3 = "s3"
    GCS = "gcs"
    KAFKA = "kafka"
    KINESIS = "kinesis"
    PUBSUB = "pubsub"
    IOT = "iot"
    PLC = "plc"
    SPREADSHEET = "spreadsheet"
    ERP_LEGACY = "erp_legacy"
    CRM = "crm"
    THIRD_PARTY = "third_party"


class IngestionMode(str, Enum):
    PUSH_WEBHOOK = "push_webhook"
    POLL = "poll"
    CDC = "cdc"
    STREAM = "stream"
    FILE_DROP = "file_drop"


class AuthType(str, Enum):
    API_KEY = "api_key"
    OAUTH = "oauth"
    BASIC = "basic"
    MTLS = "mtls"
    JWT = "jwt"
    NONE = "none"


class ConnectorStatus(str, Enum):
    CONFIGURED = "configured"
    TESTING = "testing"
    ACTIVE = "active"
    PAUSED = "paused"
    FAILED = "failed"
    ARCHIVED = "archived"


@dataclass
class ConnectorDescriptor:
    connector_id: str
    tenant_id: str
    name: str
    description: str
    connector_type: ConnectorType
    ingestion_mode: IngestionMode
    produces_entity_types: List[str]
    auth_type: AuthType = AuthType.NONE
    schedule_cron: Optional[str] = None       # for POLL mode
    topic: Optional[str] = None                # for STREAM mode
    webhook_path: Optional[str] = None         # for WEBHOOK mode
    config: Dict[str, Any] = field(default_factory=dict)
    category: str = "generic"
    vendor: str = "internal"
    sensitivity_level: str = "internal"        # public|internal|confidential|pii|restricted
    owner: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class ConnectorHealth:
    connector_id: str
    status: ConnectorStatus = ConnectorStatus.CONFIGURED
    last_sync_at: Optional[datetime] = None
    last_error_at: Optional[datetime] = None
    last_error_message: Optional[str] = None
    events_per_minute: float = 0.0
    total_records_ingested: int = 0
    health_score: float = 100.0
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class Connector:
    descriptor: ConnectorDescriptor
    health: ConnectorHealth


class ConnectorRegistry:
    def __init__(self) -> None:
        self._connectors: Dict[str, Connector] = {}

    def register(self, descriptor: ConnectorDescriptor) -> Connector:
        health = ConnectorHealth(connector_id=descriptor.connector_id)
        connector = Connector(descriptor=descriptor, health=health)
        self._connectors[descriptor.connector_id] = connector
        return connector

    def get(self, connector_id: str) -> Optional[Connector]:
        return self._connectors.get(connector_id)

    def all(self) -> List[Connector]:
        return list(self._connectors.values())

    def by_tenant(self, tenant_id: str) -> List[Connector]:
        return [c for c in self._connectors.values() if c.descriptor.tenant_id == tenant_id]

    def by_mode(self, mode: IngestionMode) -> List[Connector]:
        return [c for c in self._connectors.values() if c.descriptor.ingestion_mode == mode]

    def by_status(self, status: ConnectorStatus) -> List[Connector]:
        return [c for c in self._connectors.values() if c.health.status == status]

    def update_health(
        self,
        connector_id: str,
        *,
        status: Optional[ConnectorStatus] = None,
        records_ingested: Optional[int] = None,
        error: Optional[str] = None,
    ) -> Optional[Connector]:
        conn = self._connectors.get(connector_id)
        if conn is None:
            return None
        now = utc_now()
        if status is not None:
            conn.health.status = status
        if records_ingested is not None:
            conn.health.total_records_ingested += records_ingested
            # Rolling EPM estimate
            elapsed_min = 1.0
            if conn.health.last_sync_at:
                delta = (now - conn.health.last_sync_at).total_seconds() / 60.0
                elapsed_min = max(0.1, min(60.0, delta))
            conn.health.events_per_minute = records_ingested / elapsed_min
            conn.health.last_sync_at = now
        if error is not None:
            conn.health.last_error_at = now
            conn.health.last_error_message = error
            conn.health.status = ConnectorStatus.FAILED
            conn.health.health_score = max(0.0, conn.health.health_score - 20.0)
        else:
            # Successful sync — gradually restore health score
            conn.health.health_score = min(100.0, conn.health.health_score + 2.0)
        conn.health.updated_at = now
        return conn

    def summary(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        conns = self.by_tenant(tenant_id) if tenant_id else self.all()
        by_status: Dict[str, int] = {}
        by_mode: Dict[str, int] = {}
        by_type: Dict[str, int] = {}
        for c in conns:
            by_status[c.health.status.value] = by_status.get(c.health.status.value, 0) + 1
            by_mode[c.descriptor.ingestion_mode.value] = by_mode.get(c.descriptor.ingestion_mode.value, 0) + 1
            by_type[c.descriptor.connector_type.value] = by_type.get(c.descriptor.connector_type.value, 0) + 1
        avg_health = sum(c.health.health_score for c in conns) / len(conns) if conns else 100.0
        return {
            "total": len(conns),
            "by_status": by_status,
            "by_mode": by_mode,
            "by_type": by_type,
            "avg_health_score": round(avg_health, 1),
            "active_count": by_status.get("active", 0),
            "failed_count": by_status.get("failed", 0),
        }

    def to_serializable(self, tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conns = self.by_tenant(tenant_id) if tenant_id else self.all()
        out: List[Dict[str, Any]] = []
        for c in conns:
            out.append({
                "connector_id": c.descriptor.connector_id,
                "tenant_id": c.descriptor.tenant_id,
                "name": c.descriptor.name,
                "description": c.descriptor.description,
                "type": c.descriptor.connector_type.value,
                "ingestion_mode": c.descriptor.ingestion_mode.value,
                "produces_entity_types": c.descriptor.produces_entity_types,
                "auth_type": c.descriptor.auth_type.value,
                "schedule_cron": c.descriptor.schedule_cron,
                "topic": c.descriptor.topic,
                "webhook_path": c.descriptor.webhook_path,
                "category": c.descriptor.category,
                "vendor": c.descriptor.vendor,
                "sensitivity_level": c.descriptor.sensitivity_level,
                "owner": c.descriptor.owner,
                "tags": c.descriptor.tags,
                "health": {
                    "status": c.health.status.value,
                    "last_sync_at": c.health.last_sync_at.isoformat() if c.health.last_sync_at else None,
                    "last_error_at": c.health.last_error_at.isoformat() if c.health.last_error_at else None,
                    "last_error_message": c.health.last_error_message,
                    "events_per_minute": c.health.events_per_minute,
                    "total_records_ingested": c.health.total_records_ingested,
                    "health_score": c.health.health_score,
                },
            })
        return out


# ════════════════════════════════════════════════════════════════
# Global instance + default seed
# ════════════════════════════════════════════════════════════════

_registry: Optional[ConnectorRegistry] = None


def get_connector_registry() -> ConnectorRegistry:
    global _registry
    if _registry is None:
        _registry = ConnectorRegistry()
        _seed_default_connectors(_registry)
    return _registry


def _seed_default_connectors(reg: ConnectorRegistry) -> None:
    """Register the default Techno-Kol Uzi connectors."""
    defaults = [
        {
            "connector_id": "tku_erp_main",
            "name": "ERP Main DB (Postgres)",
            "description": "The primary Priority ERP database for Techno-Kol Uzi",
            "connector_type": ConnectorType.POSTGRES,
            "ingestion_mode": IngestionMode.CDC,
            "produces_entity_types": ["Project", "Invoice", "Order", "Employee"],
            "auth_type": AuthType.BASIC,
            "category": "erp",
            "vendor": "Priority Software",
            "sensitivity_level": "confidential",
            "schedule_cron": "*/2 * * * *",
        },
        {
            "connector_id": "tku_crm_salesforce",
            "name": "Salesforce CRM",
            "description": "Customer and lead data from Salesforce",
            "connector_type": ConnectorType.CRM,
            "ingestion_mode": IngestionMode.POLL,
            "produces_entity_types": ["Customer", "Lead", "Opportunity"],
            "auth_type": AuthType.OAUTH,
            "category": "crm",
            "vendor": "Salesforce",
            "sensitivity_level": "pii",
            "schedule_cron": "*/5 * * * *",
        },
        {
            "connector_id": "tku_mes_production",
            "name": "MES Production",
            "description": "Manufacturing execution system for the production floor",
            "connector_type": ConnectorType.POSTGRES,
            "ingestion_mode": IngestionMode.POLL,
            "produces_entity_types": ["ProductionOrder", "ProductionLine", "MachineEvent"],
            "auth_type": AuthType.BASIC,
            "category": "production",
            "vendor": "Internal",
            "schedule_cron": "*/1 * * * *",
        },
        {
            "connector_id": "tku_wms_sap",
            "name": "Warehouse WMS (SAP)",
            "description": "SAP warehouse management system — stock + movements",
            "connector_type": ConnectorType.MSSQL,
            "ingestion_mode": IngestionMode.POLL,
            "produces_entity_types": ["Material", "StockMovement"],
            "auth_type": AuthType.BASIC,
            "category": "inventory",
            "vendor": "SAP",
            "schedule_cron": "*/2 * * * *",
        },
        {
            "connector_id": "tku_iot_sensors",
            "name": "IoT Sensors (OPC-UA)",
            "description": "Production floor sensors streaming telemetry",
            "connector_type": ConnectorType.IOT,
            "ingestion_mode": IngestionMode.STREAM,
            "produces_entity_types": ["SensorReading", "MachineState"],
            "auth_type": AuthType.MTLS,
            "category": "production",
            "vendor": "Siemens",
            "topic": "iot.sensors.raw",
        },
        {
            "connector_id": "tku_supplier_hydro_api",
            "name": "Hydro Aluminium Supplier API",
            "description": "Critical upstream supplier — PO status feed",
            "connector_type": ConnectorType.REST_API,
            "ingestion_mode": IngestionMode.POLL,
            "produces_entity_types": ["PurchaseOrder", "Shipment"],
            "auth_type": AuthType.API_KEY,
            "category": "procurement",
            "vendor": "Hydro Aluminium",
            "schedule_cron": "*/10 * * * *",
        },
        {
            "connector_id": "tku_finance_priority",
            "name": "Priority Finance",
            "description": "Finance ledger and invoicing",
            "connector_type": ConnectorType.ERP_LEGACY,
            "ingestion_mode": IngestionMode.CDC,
            "produces_entity_types": ["Invoice", "Payment", "GLEntry"],
            "auth_type": AuthType.BASIC,
            "category": "finance",
            "vendor": "Priority",
            "sensitivity_level": "confidential",
            "schedule_cron": "*/2 * * * *",
        },
        {
            "connector_id": "tku_stripe_payments",
            "name": "Stripe Payments",
            "description": "Online payments for small invoices",
            "connector_type": ConnectorType.REST_API,
            "ingestion_mode": IngestionMode.PUSH_WEBHOOK,
            "produces_entity_types": ["Payment"],
            "auth_type": AuthType.API_KEY,
            "category": "finance",
            "vendor": "Stripe",
            "webhook_path": "/ingest/webhook/stripe",
        },
        {
            "connector_id": "tku_shipping_fedex",
            "name": "FedEx Shipping",
            "description": "Outbound shipment tracking",
            "connector_type": ConnectorType.REST_API,
            "ingestion_mode": IngestionMode.PUSH_WEBHOOK,
            "produces_entity_types": ["Shipment"],
            "auth_type": AuthType.API_KEY,
            "category": "logistics",
            "vendor": "FedEx",
            "webhook_path": "/ingest/webhook/fedex",
        },
        {
            "connector_id": "tku_hr_bamboo",
            "name": "BambooHR",
            "description": "Employee and department records",
            "connector_type": ConnectorType.REST_API,
            "ingestion_mode": IngestionMode.POLL,
            "produces_entity_types": ["Employee", "Department"],
            "auth_type": AuthType.API_KEY,
            "category": "hr",
            "vendor": "BambooHR",
            "sensitivity_level": "pii",
            "schedule_cron": "0 */4 * * *",
        },
        {
            "connector_id": "tku_spreadsheet_drop",
            "name": "Customer Excel Spreadsheets",
            "description": "Legacy customer data — SFTP file drops",
            "connector_type": ConnectorType.FILE_DROP,
            "ingestion_mode": IngestionMode.FILE_DROP,
            "produces_entity_types": ["Customer"],
            "auth_type": AuthType.NONE,
            "category": "crm",
            "vendor": "legacy",
            "schedule_cron": "0 2 * * *",
        },
        {
            "connector_id": "tku_quality_kafka",
            "name": "Quality Events Stream",
            "description": "Real-time quality control events from the production line",
            "connector_type": ConnectorType.KAFKA,
            "ingestion_mode": IngestionMode.STREAM,
            "produces_entity_types": ["QCInspection", "QCFailure"],
            "auth_type": AuthType.MTLS,
            "category": "quality",
            "vendor": "Confluent",
            "topic": "quality.events",
        },
    ]
    for d in defaults:
        reg.register(ConnectorDescriptor(
            tenant_id="techno_kol_uzi",
            owner="ops_platform",
            tags=[d["category"], d["vendor"]],
            **d,
        ))
        # Simulate some activity so dashboards don't look empty
        reg.update_health(
            d["connector_id"],
            status=ConnectorStatus.ACTIVE,
            records_ingested=100,
        )
