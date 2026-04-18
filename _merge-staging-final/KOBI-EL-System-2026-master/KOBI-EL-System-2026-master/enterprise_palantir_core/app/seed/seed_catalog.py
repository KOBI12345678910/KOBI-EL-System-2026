"""
Seed catalog — the entire "shape" of the demo company as data.

This is the single source of truth for every seeded entity, relationship,
workflow, alert rule, and policy. Organized as a structured Python
dictionary so it can be loaded deterministically.

The catalog defines **Techno-Kol Uzi** (the real company) plus two
secondary tenants for multi-tenant demonstrations.
"""

from __future__ import annotations

from typing import Any, Dict, List

# ════════════════════════════════════════════════════════════════
# TENANTS
# ════════════════════════════════════════════════════════════════

TENANTS: List[Dict[str, Any]] = [
    {
        "id": "techno_kol_uzi",
        "name": "Techno-Kol Uzi — Metal/Aluminum/Glass",
        "is_active": True,
        "primary": True,
    },
    {
        "id": "alpha_industries",
        "name": "Alpha Industries (demo tenant)",
        "is_active": True,
        "primary": False,
    },
    {
        "id": "beta_manufacturing",
        "name": "Beta Manufacturing (demo tenant)",
        "is_active": True,
        "primary": False,
    },
]


# ════════════════════════════════════════════════════════════════
# ENTITIES — per tenant
# Every entity follows the ingestion contract (IngestRecordIn):
#   tenant_id, source_system, source_record_id, entity_type,
#   entity_name, canonical_external_key, event_type, severity,
#   properties, relationships
# ════════════════════════════════════════════════════════════════

TECHNO_KOL_UZI_ENTITIES: List[Dict[str, Any]] = [
    # ─── CUSTOMERS ───
    # NOTE on relationships: the VALUES are strings of the form
    # "{entity_type}:{canonical_external_key}", e.g. "Project:PROJ-0001".
    # The seed runner performs a 2-pass ingest: first it builds an
    # index of (entity_type, external_key) → real obj_ id, then it
    # re-ingests every entity with relationships rewritten to real
    # canonical object ids so graph traversal resolves correctly.
    {
        "source_system": "crm_salesforce",
        "source_record_id": "sf_cust_0001",
        "entity_type": "Customer",
        "entity_name": "אלקו בע״מ",
        "canonical_external_key": "CUST-0001",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "active",
            "tier": "gold",
            "annual_revenue_ils": 1_850_000,
            "country": "IL",
            "primary_contact": "david@elco.co.il",
        },
        "relationships": {
            "has_projects": ["Project:PROJ-0001"],
            "has_invoices": ["Invoice:INV-0001", "Invoice:INV-0002"],
        },
    },
    {
        "source_system": "crm_salesforce",
        "source_record_id": "sf_cust_0002",
        "entity_type": "Customer",
        "entity_name": "הפניקס בנייה",
        "canonical_external_key": "CUST-0002",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "active",
            "tier": "silver",
            "annual_revenue_ils": 920_000,
            "country": "IL",
            "primary_contact": "office@phoenix.co.il",
        },
        "relationships": {
            "has_projects": ["Project:PROJ-0002"],
            "has_invoices": ["Invoice:INV-0003"],
        },
    },
    {
        "source_system": "crm_salesforce",
        "source_record_id": "sf_cust_0003",
        "entity_type": "Customer",
        "entity_name": "אלום פרו",
        "canonical_external_key": "CUST-0003",
        "event_type": "entity_upserted",
        "severity": "warning",
        "properties": {
            "status": "at_risk",
            "tier": "bronze",
            "annual_revenue_ils": 480_000,
            "country": "IL",
            "risk_note": "collections overdue 45 days",
        },
        "relationships": {
            "has_projects": ["Project:PROJ-0003"],
            "has_invoices": ["Invoice:INV-0004"],
        },
    },

    # ─── SUPPLIERS ───
    {
        "source_system": "procurement_api",
        "source_record_id": "proc_sup_0001",
        "entity_type": "Supplier",
        "entity_name": "Hydro Aluminium Norway",
        "canonical_external_key": "SUPP-0001",
        "event_type": "supplier_delayed",
        "severity": "high",
        "properties": {
            "status": "at_risk",
            "country": "NO",
            "lead_time_days": 45,
            "on_time_rate": 0.71,
            "delay_days": 7,
            "current_po_value_ils": 180_000,
        },
        "relationships": {
            "supplies_materials": ["Material:MAT-0001"],
            "blocks_production": ["ProductionOrder:PROD-0001"],
            "impacts_projects": ["Project:PROJ-0001", "Project:PROJ-0002"],
        },
    },
    {
        "source_system": "procurement_api",
        "source_record_id": "proc_sup_0002",
        "entity_type": "Supplier",
        "entity_name": "Guardian Glass Europe",
        "canonical_external_key": "SUPP-0002",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "active",
            "country": "DE",
            "lead_time_days": 21,
            "on_time_rate": 0.94,
        },
        "relationships": {
            "supplies_materials": ["Material:MAT-0002"],
        },
    },
    {
        "source_system": "procurement_api",
        "source_record_id": "proc_sup_0003",
        "entity_type": "Supplier",
        "entity_name": "Schüco International",
        "canonical_external_key": "SUPP-0003",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "active",
            "country": "DE",
            "lead_time_days": 30,
            "on_time_rate": 0.97,
        },
        "relationships": {
            "supplies_materials": ["Material:MAT-0003"],
        },
    },

    # ─── PROJECTS ───
    {
        "source_system": "erp_main",
        "source_record_id": "erp_proj_0001",
        "entity_type": "Project",
        "entity_name": "חזית אלומיניום — מגדל אלקו תל אביב",
        "canonical_external_key": "PROJ-0001",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "in_progress",
            "progress_pct": 62,
            "value_ils": 1_850_000,
            "start_date": "2026-01-15",
            "target_completion": "2026-05-30",
            "pm": "יוסי כהן",
        },
        "relationships": {
            "for_customer": ["Customer:CUST-0001"],
            "depends_on_suppliers": ["Supplier:SUPP-0001"],
            "production_orders": ["ProductionOrder:PROD-0001"],
            "has_installations": ["Installation:INST-0001"],
        },
    },
    {
        "source_system": "erp_main",
        "source_record_id": "erp_proj_0002",
        "entity_type": "Project",
        "entity_name": "מערכת זיגוג — מתחם פניקס",
        "canonical_external_key": "PROJ-0002",
        "event_type": "entity_upserted",
        "severity": "warning",
        "properties": {
            "status": "at_risk",
            "progress_pct": 38,
            "value_ils": 920_000,
            "start_date": "2026-02-01",
            "target_completion": "2026-06-15",
            "risk_note": "material shortage + supplier delay",
        },
        "relationships": {
            "for_customer": ["Customer:CUST-0002"],
            "depends_on_suppliers": ["Supplier:SUPP-0001"],
            "production_orders": ["ProductionOrder:PROD-0002"],
        },
    },
    {
        "source_system": "erp_main",
        "source_record_id": "erp_proj_0003",
        "entity_type": "Project",
        "entity_name": "מעטפת זכוכית — בית אלום פרו",
        "canonical_external_key": "PROJ-0003",
        "event_type": "project_at_risk",
        "severity": "critical",
        "properties": {
            "status": "delayed",
            "progress_pct": 22,
            "value_ils": 480_000,
            "delay_days": 18,
            "risk_note": "collections overdue 45 days + QC failure",
        },
        "relationships": {
            "for_customer": ["Customer:CUST-0003"],
            "has_invoices": ["Invoice:INV-0004"],
        },
    },

    # ─── MATERIALS / INVENTORY ───
    {
        "source_system": "wms_sap",
        "source_record_id": "wms_mat_0001",
        "entity_type": "Material",
        "entity_name": "פרופיל אלומיניום 6060",
        "canonical_external_key": "MAT-0001",
        "event_type": "inventory_low",
        "severity": "high",
        "properties": {
            "status": "low",
            "qty_on_hand": 12,
            "reorder_point": 50,
            "unit_cost_ils": 285,
            "unit": "meter",
        },
        "relationships": {
            "supplied_by": ["Supplier:SUPP-0001"],
            "used_in_projects": ["Project:PROJ-0001", "Project:PROJ-0002"],
        },
    },
    {
        "source_system": "wms_sap",
        "source_record_id": "wms_mat_0002",
        "entity_type": "Material",
        "entity_name": "זכוכית טמפרד 6mm",
        "canonical_external_key": "MAT-0002",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "ok",
            "qty_on_hand": 450,
            "reorder_point": 100,
            "unit_cost_ils": 45,
            "unit": "sqm",
        },
        "relationships": {
            "supplied_by": ["Supplier:SUPP-0002"],
        },
    },
    {
        "source_system": "wms_sap",
        "source_record_id": "wms_mat_0003",
        "entity_type": "Material",
        "entity_name": "ידיות ואביזרי חיבור",
        "canonical_external_key": "MAT-0003",
        "event_type": "inventory_low",
        "severity": "critical",
        "properties": {
            "status": "critical",
            "qty_on_hand": 3,
            "reorder_point": 20,
            "unit_cost_ils": 42,
            "unit": "piece",
        },
        "relationships": {
            "supplied_by": ["Supplier:SUPP-0003"],
        },
    },

    # ─── PRODUCTION ORDERS ───
    {
        "source_system": "mes_production",
        "source_record_id": "mes_prod_0001",
        "entity_type": "ProductionOrder",
        "entity_name": "ייצור חזית אלקו — סדרה ראשונה",
        "canonical_external_key": "PROD-0001",
        "event_type": "entity_upserted",
        "severity": "warning",
        "properties": {
            "status": "in_progress",
            "progress_pct": 55,
            "line_id": "line-A",
            "target_qty": 120,
            "produced_qty": 66,
            "blocked_by": "material_shortage",
        },
        "relationships": {
            "for_project": ["Project:PROJ-0001"],
            "consumes_materials": ["Material:MAT-0001"],
        },
    },
    {
        "source_system": "mes_production",
        "source_record_id": "mes_prod_0002",
        "entity_type": "ProductionOrder",
        "entity_name": "ייצור חלונות פניקס",
        "canonical_external_key": "PROD-0002",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "queued",
            "progress_pct": 0,
            "line_id": "line-B",
            "target_qty": 80,
        },
        "relationships": {
            "for_project": ["Project:PROJ-0002"],
        },
    },

    # ─── INVOICES ───
    {
        "source_system": "finance_priority",
        "source_record_id": "fin_inv_0001",
        "entity_type": "Invoice",
        "entity_name": "חשבונית #30301 — אלקו",
        "canonical_external_key": "INV-0001",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "paid",
            "amount_ils": 185_000,
            "issue_date": "2026-02-15",
            "due_date": "2026-03-15",
            "paid_date": "2026-03-12",
        },
        "relationships": {
            "for_customer": ["Customer:CUST-0001"],
            "for_project": ["Project:PROJ-0001"],
        },
    },
    {
        "source_system": "finance_priority",
        "source_record_id": "fin_inv_0002",
        "entity_type": "Invoice",
        "entity_name": "חשבונית #30305 — אלקו שלב 2",
        "canonical_external_key": "INV-0002",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "sent",
            "amount_ils": 240_000,
            "issue_date": "2026-03-20",
            "due_date": "2026-04-20",
        },
        "relationships": {
            "for_customer": ["Customer:CUST-0001"],
            "for_project": ["Project:PROJ-0001"],
        },
    },
    {
        "source_system": "finance_priority",
        "source_record_id": "fin_inv_0003",
        "entity_type": "Invoice",
        "entity_name": "חשבונית #30310 — פניקס",
        "canonical_external_key": "INV-0003",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "sent",
            "amount_ils": 125_000,
            "issue_date": "2026-03-25",
            "due_date": "2026-04-25",
        },
        "relationships": {
            "for_customer": ["Customer:CUST-0002"],
            "for_project": ["Project:PROJ-0002"],
        },
    },
    {
        "source_system": "finance_priority",
        "source_record_id": "fin_inv_0004",
        "entity_type": "Invoice",
        "entity_name": "חשבונית #30312 — אלום פרו",
        "canonical_external_key": "INV-0004",
        "event_type": "entity_upserted",
        "severity": "critical",
        "properties": {
            "status": "overdue",
            "amount_ils": 95_000,
            "issue_date": "2026-02-01",
            "due_date": "2026-03-01",
            "days_overdue": 40,
        },
        "relationships": {
            "for_customer": ["Customer:CUST-0003"],
            "for_project": ["Project:PROJ-0003"],
        },
    },

    # ─── INSTALLATIONS ───
    {
        "source_system": "field_ops",
        "source_record_id": "field_inst_0001",
        "entity_type": "Installation",
        "entity_name": "התקנה — חזית מגדל אלקו קומה 15",
        "canonical_external_key": "INST-0001",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "scheduled",
            "scheduled_date": "2026-04-20",
            "team_lead": "רונן לוי",
            "location": "תל אביב",
        },
        "relationships": {
            "for_project": ["Project:PROJ-0001"],
        },
    },

    # ─── EMPLOYEES ───
    {
        "source_system": "hr_bamboohr",
        "source_record_id": "hr_emp_0001",
        "entity_type": "Employee",
        "entity_name": "יוסי כהן — מנהל פרויקטים",
        "canonical_external_key": "EMP-0001",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "active",
            "department": "projects",
            "role": "project_manager",
            "utilization_pct": 92,
        },
        "relationships": {
            "manages_projects": ["Project:PROJ-0001", "Project:PROJ-0002"],
        },
    },
    {
        "source_system": "hr_bamboohr",
        "source_record_id": "hr_emp_0002",
        "entity_type": "Employee",
        "entity_name": "רונן לוי — ראש צוות התקנות",
        "canonical_external_key": "EMP-0002",
        "event_type": "entity_upserted",
        "severity": "info",
        "properties": {
            "status": "active",
            "department": "field_ops",
            "role": "installation_lead",
            "utilization_pct": 85,
        },
        "relationships": {
            "leads_installations": ["Installation:INST-0001"],
        },
    },
]


# ════════════════════════════════════════════════════════════════
# WORKFLOW DEFINITIONS
# ════════════════════════════════════════════════════════════════

WORKFLOW_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "id": "wf_def_project_delivery",
        "workflow_type": "project_delivery",
        "definition": {
            "entry_state": "kickoff",
            "states": [
                {"name": "kickoff", "sla_seconds": 86400},
                {"name": "design", "sla_seconds": 604800},
                {"name": "procurement", "sla_seconds": 1209600},
                {"name": "production", "sla_seconds": 2592000},
                {"name": "installation", "sla_seconds": 604800},
                {"name": "handover", "sla_seconds": 172800},
                {"name": "completed", "is_terminal": True},
                {"name": "cancelled", "is_terminal": True},
            ],
            "transitions": [
                {"from_state": "kickoff", "to_state": "design", "trigger_event": "project_approved"},
                {"from_state": "design", "to_state": "procurement", "trigger_event": "design_approved"},
                {"from_state": "procurement", "to_state": "production", "trigger_event": "materials_received"},
                {"from_state": "production", "to_state": "installation", "trigger_event": "production_complete"},
                {"from_state": "installation", "to_state": "handover", "trigger_event": "installation_complete"},
                {"from_state": "handover", "to_state": "completed", "trigger_event": "customer_acceptance"},
            ],
        },
    },
    {
        "id": "wf_def_purchase_order",
        "workflow_type": "purchase_order",
        "definition": {
            "entry_state": "draft",
            "states": [
                {"name": "draft"},
                {"name": "pending_approval", "requires_approval": True},
                {"name": "approved"},
                {"name": "sent_to_supplier"},
                {"name": "in_transit"},
                {"name": "received", "is_terminal": True},
                {"name": "cancelled", "is_terminal": True},
            ],
            "transitions": [
                {"from_state": "draft", "to_state": "pending_approval", "trigger_event": "submitted"},
                {"from_state": "pending_approval", "to_state": "approved"},
                {"from_state": "approved", "to_state": "sent_to_supplier", "trigger_event": "po_sent"},
                {"from_state": "sent_to_supplier", "to_state": "in_transit", "trigger_event": "shipment_confirmed"},
                {"from_state": "in_transit", "to_state": "received", "trigger_event": "goods_received"},
            ],
        },
    },
    {
        "id": "wf_def_collections",
        "workflow_type": "collections",
        "definition": {
            "entry_state": "invoice_sent",
            "states": [
                {"name": "invoice_sent", "sla_seconds": 2592000},
                {"name": "overdue_10", "sla_seconds": 604800},
                {"name": "overdue_30", "sla_seconds": 1209600},
                {"name": "escalated", "requires_approval": True},
                {"name": "paid", "is_terminal": True},
                {"name": "written_off", "is_terminal": True},
            ],
            "transitions": [
                {"from_state": "invoice_sent", "to_state": "overdue_10", "trigger_event": "overdue_detected"},
                {"from_state": "overdue_10", "to_state": "overdue_30", "trigger_event": "overdue_30_days"},
                {"from_state": "overdue_30", "to_state": "escalated", "trigger_event": "escalate_to_legal"},
                {"from_state": "overdue_30", "to_state": "paid", "trigger_event": "payment_received"},
                {"from_state": "escalated", "to_state": "paid", "trigger_event": "payment_received"},
            ],
        },
    },
]


# ════════════════════════════════════════════════════════════════
# POLICIES (guardrails)
# ════════════════════════════════════════════════════════════════

POLICIES: List[Dict[str, Any]] = [
    {
        "policy_id": "pol.financial.purchase_cap",
        "name": "Purchase order financial cap",
        "action_type_match": "procurement.create_po",
        "max_impact_usd": 250_000,
        "requires_approval": True,
    },
    {
        "policy_id": "pol.financial.invoice_autopay",
        "name": "Auto-pay cap",
        "action_type_match": "finance.auto_pay",
        "max_impact_usd": 50_000,
        "max_per_day": 20,
    },
    {
        "policy_id": "pol.customer.discount",
        "name": "Discount authority",
        "action_type_match": "sales.offer_discount",
        "max_impact_usd": 15_000,
        "max_per_day": 10,
    },
    {
        "policy_id": "pol.operations.reroute_production",
        "name": "Production rerouting",
        "action_type_match": "production.reroute",
        "requires_approval": True,
    },
    {
        "policy_id": "pol.supplier.escalate",
        "name": "Supplier delay escalation",
        "action_type_match": "supplier.escalate_delay",
        "max_per_minute": 10,
        "max_per_day": 100,
    },
]


# ════════════════════════════════════════════════════════════════
# STANDARD ROLES
# ════════════════════════════════════════════════════════════════

ROLES: List[Dict[str, Any]] = [
    {
        "id": "role_platform_admin",
        "name": "platform_admin",
        "permissions": ["*"],
    },
    {
        "id": "role_ops_manager",
        "name": "ops_manager",
        "permissions": [
            "ontology.read",
            "ontology.write",
            "workflow.read",
            "workflow.manage",
            "alert.read",
            "alert.acknowledge",
            "action.request",
            "action.execute",
        ],
    },
    {
        "id": "role_finance_manager",
        "name": "finance_manager",
        "permissions": [
            "ontology.read",
            "alert.read",
            "action.request",
            "action.approve",
            "audit.read",
        ],
    },
    {
        "id": "role_analyst",
        "name": "analyst",
        "permissions": [
            "ontology.read",
            "workflow.read",
            "alert.read",
            "audit.read",
        ],
    },
]
