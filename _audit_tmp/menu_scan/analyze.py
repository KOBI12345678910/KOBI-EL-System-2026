import os, re, json
from pathlib import Path

BASE = Path("C:/Users/kobi/Projects/techno-kol-uzi-2026")
TMP = BASE / "_audit_tmp" / "menu_scan"

# Load menu routes (strip quotes)
with open(TMP / "menu_routes.txt", encoding="utf-8") as f:
    menu_routes = set(line.strip().strip("'") for line in f if line.strip())

# Normalize: lowercase, no trailing slash
def norm(r):
    if not r: return ""
    r = r.lower().strip("/")
    return r

menu_norm = set(norm(r) for r in menu_routes)

# Also build tokens (words in paths)
menu_tokens = set()
for r in menu_norm:
    for part in r.replace("-", "/").split("/"):
        if part:
            menu_tokens.add(part)

# Table name variants
def table_variants(table):
    schema, name = table.split(".")
    variants = set()
    variants.add(name)
    variants.add(name.replace("_", "-"))
    # singular
    s = name
    if s.endswith("ies"):
        variants.add(s[:-3] + "y")
        variants.add((s[:-3] + "y").replace("_", "-"))
    elif s.endswith("s") and not s.endswith("ss"):
        variants.add(s[:-1])
        variants.add(s[:-1].replace("_", "-"))
    # plural
    variants.add(name + "s")
    variants.add((name + "s").replace("_", "-"))
    return variants

# Load DB tables
with open(TMP / "db_tables.txt", encoding="utf-8") as f:
    tables = [line.strip() for line in f if line.strip()]

# Internal tables to exclude
EXCLUDE = {
    "governance.audit_logs", "governance.idempotency_keys", "governance.state_history",
    "governance.domain_events", "governance.event_deliveries", "governance.event_subscriptions",
    "comms.notification_deliveries", "governance.webhook_deliveries", "governance.webhook_endpoints",
    "comms.portal_sessions", "comms.chatbot_sessions", "governance.command_logs",
    "governance.security_events", "governance.job_executions", "governance.queue_jobs",
    "governance.sla_timers", "governance.health_checks", "governance.feature_flag_targets",
    "governance.validations_log", "governance.workflow_step_executions",
    "orchestration.workflow_step_runs", "orchestration.workflow_runs",
    "intelligence.agent_jobs", "intelligence.model_executions",
    "analytics.rm_ai_summary", "analytics.rm_executive_summary", "analytics.rm_finance_summary",
    "analytics.rm_operations_summary", "analytics.rm_procurement_summary", "analytics.rm_workforce_summary",
    "documents.document_chunks", "governance.audit_log_attachments",
    "commercial.pipeline_stages", "commercial.lead_tags", "commercial.lead_tag_assignments",
    "analytics.read_model_invalidations",
    "routing.menu_nodes", "routing.route_registry", "routing.route_permission_map",
    "public.app_menu", "governance.workflow_instances", "governance.workflow_steps",
    "governance.workflows", "governance.event_subscriptions",
}

# Check which tables have a menu presence
def table_in_menu(table):
    if table in EXCLUDE: return True  # skip
    name = table.split(".")[1]
    for v in table_variants(table):
        vn = norm(v)
        if vn in menu_norm: return True
        # also check if appears as substring in any menu route
        for mr in menu_norm:
            if vn == mr.split("/")[-1]: return True
            # also check ending segment
            if "/" + vn in "/" + mr: 
                # exact segment match
                segs = mr.split("/")
                if vn in segs: return True
    return False

invisible_tables = []
visible_tables = []
for t in tables:
    if t in EXCLUDE: continue
    if table_in_menu(t):
        visible_tables.append(t)
    else:
        invisible_tables.append(t)

# API engines check
with open(TMP / "api_engines.txt", encoding="utf-8") as f:
    engines = [line.strip() for line in f if line.strip()]

def engine_in_menu(eng):
    # engine is filename like "accounting-export"
    en = norm(eng)
    # Check direct match and common path prefixes
    if en in menu_norm: return True
    # Check if any menu route ends with this engine name
    for mr in menu_norm:
        segs = mr.split("/")
        if en in segs: return True
    return False

invisible_engines = [e for e in engines if not engine_in_menu(e)]
visible_engines = [e for e in engines if engine_in_menu(e)]

# Page routes check
with open(TMP / "page_routes.txt", encoding="utf-8") as f:
    pages = [line.strip() for line in f if line.strip()]

# Remove layout/helper pages
PAGE_EXCLUDE_RE = re.compile(r"(layout|_app|not-found|error|loading|index$|components/|__tests__|\[.*\])", re.I)

invisible_pages = []
for p in pages:
    if PAGE_EXCLUDE_RE.search(p): continue
    pn = norm(p)
    if pn in menu_norm: continue
    # also try without plurals
    if pn in menu_norm: continue
    invisible_pages.append(p)

# Edge functions
with open(TMP / "edge_functions.txt", encoding="utf-8") as f:
    edge_funcs = [line.strip() for line in f if line.strip() and not line.startswith("_")]

def edge_in_menu(ef):
    en = norm(ef)
    for mr in menu_norm:
        segs = mr.replace("-", "/").split("/")
        if en.replace("-", "") in "".join(segs).replace("-", ""):
            # loose check
            pass
    # action-style: edge function "approve-po" → menu action on /pos
    return False  # treat all as invisible capabilities by default

# Write JSON summary
out = {
    "menu_routes_count": len(menu_norm),
    "total_tables": len(tables),
    "excluded_internal": len(EXCLUDE),
    "invisible_tables": invisible_tables,
    "visible_tables": visible_tables,
    "total_engines": len(engines),
    "invisible_engines": invisible_engines,
    "visible_engines": visible_engines,
    "total_pages": len(pages),
    "invisible_pages_count": len(invisible_pages),
    "invisible_pages": invisible_pages[:500],
    "edge_functions": edge_funcs,
}
(TMP / "analysis.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
print("Menu routes:", len(menu_norm))
print("Tables total:", len(tables), "excluded:", len(EXCLUDE), "invisible:", len(invisible_tables), "visible:", len(visible_tables))
print("Engines total:", len(engines), "invisible:", len(invisible_engines), "visible:", len(visible_engines))
print("Pages total:", len(pages), "invisible:", len(invisible_pages))
print("Edge functions:", len(edge_funcs))
