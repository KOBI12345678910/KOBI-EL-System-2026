#!/usr/bin/env python3
"""
Generate supabase/migrations/00038_merged_sources_menu_additions.sql
from discovered pages. Filter out routes already in the existing menu.
"""
import json, re
from pathlib import Path

ROOT = Path(r"C:/Users/kobi/Projects/techno-kol-uzi-2026")
STAGING = ROOT / "_merge-staging"

new_entities = json.loads((STAGING / "_new-entities.json").read_text(encoding="utf-8"))
existing_routes = set()
for line in (STAGING / "_existing_routes.txt").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line.startswith("/"):
        existing_routes.add(line.rstrip("/"))

# Category assignment by prefix of route
# Post-00036 categories:
#   1 דשבורד | 2 מכירות | 3 רכש | 4 פרויקטים | 5 מלאי | 6 כספים | 7 מיסוי
#   8 כ״א ושכר | 9 תקשורת | 10 מסמכים | 11 AI | 12 Compliance
#   13 תשתיות | 14 אינטגרציות | 15 מערכת
CATEGORY_RULES = [
    # (regex, category_id, starting order_index for this category, icon)
    # Order matters: more-specific first.
    (re.compile(r"^/(ai-engine|ai|ml|nlq|analytics|intelligence|predict|bi|advanced|bash44|causal|command-center|builder|automation|workflow|agents?|rag|chatbot|llm)(/|$)"), 11, 200, "🤖"),
    (re.compile(r"^/(sales|crm|quotation|quote|lead|pipeline|opportunity|opportunities|territory|territories|deal)(/|$)"), 2, 200, "💼"),
    (re.compile(r"^/(procurement|supplier|suppliers|po|purchase|rfq|rfp|vendor)(/|$)"), 3, 200, "🧾"),
    (re.compile(r"^/(projects?|pm|gantt|change-order|earned-value|milestone|task-management)(/|$)"), 4, 200, "📐"),
    (re.compile(r"^/(inventory|stock|warehouse|parts|wms|bom|material)(/|$)"), 5, 200, "📦"),
    (re.compile(r"^/(finance|invoice|invoicing|billing|payments?|accounting|gl|ar|ap|cash|banking|treasury|ledger|bank|reconcil|budget|forecast)(/|$)"), 6, 300, "💰"),
    (re.compile(r"^/(tax|vat|withholding|itax|form-126|form-856)(/|$)"), 7, 200, "🏛️"),
    (re.compile(r"^/(hr|employees?|payroll|timesheet|leave|recruit|onboarding|terminations?|workforce|performance-review|staff|crew)(/|$)"), 8, 300, "👥"),
    (re.compile(r"^/(comm|chat|message|notifications?|email|sms|whatsapp|inbox|call-center|customer-service|complaints|service-dashboard|rma)(/|$)"), 9, 200, "💬"),
    (re.compile(r"^/(docs?|documents?|contracts?|files?|templates?|signing|signatures?|dms|ocr)(/|$)"), 10, 200, "📄"),
    (re.compile(r"^/(compliance|audit|gdpr|regulatory|security|iso|policy|policies)(/|$)"), 12, 200, "🛡️"),
    (re.compile(r"^/(ops|runbook|monitoring|sre|incident|performance|observability|health|jobs|scheduler|queue)(/|$)"), 13, 200, "⚙️"),
    (re.compile(r"^/(integration|integrations|connectors?|api-hub|api|webhooks?|sync|gps|location|maps?|bridge|etl)(/|$)"), 14, 200, "🔌"),
    (re.compile(r"^/(assets?|equipment|leasing|fleet|vehicle)(/|$)"), 5, 400, "🚗"),
    (re.compile(r"^/(bi|reports?|dashboards?)(/|$)"), 11, 400, "📊"),
    (re.compile(r"^/(settings?|users?|roles?|permissions?|admin|system|preferences|localization|i18n|tenant)(/|$)"), 15, 300, "🛠️"),
]

HEBREW_LABELS = {
    # Curated Hebrew labels for common route leaves (best-effort)
    # fallback: titleize the slug
}

def titleize_route(route: str) -> str:
    """Derive a Hebrew/title label — fallback if no HEBREW_LABELS match."""
    leaf = route.rstrip("/").split("/")[-1]
    # Replace common patterns
    leaf = leaf.replace("-", " ").replace("_", " ").strip()
    if not leaf:
        return route
    # keep title case English — user can translate if desired
    return leaf.title()

def tsx_to_route(tsx_path: str) -> str:
    """
    erp-app/src/pages/ai-engine/bash44-agent-config.tsx
      -> /ai-engine/bash44-agent-config
    erp-app/src/pages/advanced/anomaly-detection.tsx
      -> /advanced/anomaly-detection
    erp-app/src/pages/ApiHub.tsx
      -> /api-hub   (lowercase-kebab)
    """
    m = re.match(r"erp-app/src/pages/(.+)\.tsx$", tsx_path)
    if not m:
        return None
    path = m.group(1)
    # Drop any '/index' suffix
    path = re.sub(r"/index$", "", path, flags=re.IGNORECASE)
    parts = path.split("/")
    def kebab(s):
        # Convert camelCase/PascalCase to kebab-case
        s = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", s).lower()
        return s
    parts = [kebab(p) for p in parts]
    return "/" + "/".join(parts)

def route_to_api(api_ts_path: str) -> str:
    """api-server/src/routes/crm-communications.ts -> /api/crm-communications (informational, not a menu route)"""
    m = re.match(r"api-server/src/routes/(.+)\.ts$", api_ts_path)
    if not m:
        return None
    return "/api/" + m.group(1)

def categorize(route: str):
    for rx, cat, start_order, icon in CATEGORY_RULES:
        if rx.match(route):
            return cat, icon
    # Default: miscellaneous tools under system
    return 15, "📁"

# Build the set of new menu entries
by_category = {}  # cat_id -> list of (route, label, icon)
new_routes_seen = set()

for page_path in new_entities["pages"]:
    route = tsx_to_route(page_path)
    if not route:
        continue
    if route in existing_routes:
        continue
    if route in new_routes_seen:
        continue
    # skip utility pages
    leaf = route.rstrip("/").split("/")[-1]
    if leaf in ("forbidden", "forgot-password", "reset-password", "not-found", "404", "login", "logout", "signup"):
        continue
    new_routes_seen.add(route)
    cat, icon = categorize(route)
    label = titleize_route(route)
    by_category.setdefault(cat, []).append((route, label, icon))

# Sort and emit SQL
CAT_NAMES = {
    1: "דשבורד", 2: "מכירות ולקוחות", 3: "רכש וספקים", 4: "פרויקטים",
    5: "מלאי ומחסן", 6: "כספים וחשבונאות", 7: "מיסוי", 8: "כוח אדם ושכר",
    9: "תקשורת", 10: "מסמכים", 11: "AI & אינטליגנציה", 12: "רגולציה וציות",
    13: "תשתיות ותפעול", 14: "אינטגרציות", 15: "מערכת וניהול",
}

out = []
out.append("-- ============================================================")
out.append("-- FILE: supabase/migrations/00038_merged_sources_menu_additions.sql")
out.append("-- Purpose:")
out.append("--   Add menu entries for pages discovered when merging additional")
out.append("--   source archives (technokoluzi-erp, AI-Task-Manager, Location-Finder,")
out.append("--   GPS-Connect, Invoice-Ledger, erp-upload, files-*).")
out.append("--")
out.append("--   Routes already present in the menu (from 00034/00035/00036) are")
out.append("--   NOT re-inserted. Duplicates are guarded by a pre-delete on route.")
out.append("--")
out.append("-- Post-00036 category ids:")
out.append("--   1 דשבורד | 2 מכירות | 3 רכש | 4 פרויקטים | 5 מלאי | 6 כספים")
out.append("--   7 מיסוי | 8 כ״א ושכר | 9 תקשורת | 10 מסמכים | 11 AI")
out.append("--   12 Compliance | 13 תשתיות | 14 אינטגרציות | 15 מערכת")
out.append("-- ============================================================")
out.append("")

total_rows = 0
for cat in sorted(by_category.keys()):
    rows = sorted(set(by_category[cat]), key=lambda r: r[0])
    if not rows:
        continue
    out.append("-- ──────────────────────────────────────────────────────────────")
    out.append(f"-- Category {cat}: {CAT_NAMES.get(cat, '?')} — {len(rows)} new routes")
    out.append("-- ──────────────────────────────────────────────────────────────")
    # delete guard
    routes_sql = ",\n  ".join(f"'{r[0]}'" for r in rows)
    out.append(f"delete from public.app_menu where route in (\n  {routes_sql}\n);")
    out.append("")
    # insert
    out.append("insert into public.app_menu (label, route, icon, parent_id, order_index) values")
    order = 500 + cat * 100  # offset start per category
    value_lines = []
    for i, (route, label, icon) in enumerate(rows):
        # escape single quotes in label
        lbl = label.replace("'", "''")
        value_lines.append(f"  ('{lbl}', '{route}', '{icon}', {cat}, {order + i})")
    out.append(",\n".join(value_lines) + ";")
    out.append("")
    total_rows += len(rows)

out.append("-- ============================================================")
out.append(f"-- Total new menu entries added: {total_rows}")
out.append("-- ============================================================")

sql = "\n".join(out) + "\n"

target = ROOT / "supabase" / "migrations" / "00038_merged_sources_menu_additions.sql"
target.write_text(sql, encoding="utf-8")
print(f"[menu] wrote {target}")
print(f"[menu] total new menu entries: {total_rows}")
print(f"[menu] by category: { {k: len(v) for k,v in by_category.items()} }")

# Also dump the mapping as JSON for the report
mapping = {CAT_NAMES[k]: [{"route": r[0], "label": r[1]} for r in v] for k, v in by_category.items()}
(STAGING / "_menu_additions.json").write_text(json.dumps(mapping, indent=2, ensure_ascii=False), encoding="utf-8")
