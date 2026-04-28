# AGENT-123 - Template System Audit

**Project:** kobi-el-system-2026
**Scope:** project_templates (6), workflow_templates (18), email_templates (8), module_templates (42)
**Date:** 2026-04-29
**Worktree:** objective-merkle-40ff93

---

## Verdict

**MIXED — only 1 of 4 template families is wired end-to-end. The other 3 are orphaned, not seeded, or wired to the wrong route.**

| Family | DB Table | Schema in Repo? | Seed in Repo | UI/API Wiring | RLS | Variables |
|--------|---------|-----------------|--------------|---------------|-----|-----------|
| `project_templates` | yes (live) | task243 SQL + drizzle | 3 rows (audit says 6) | UI page exists, route mismatch | DISABLED | `{{var}}` substitution working |
| `workflow_templates` | yes (live, orphan) | NONE found | NONE | Hardcoded fallback only | DISABLED | n/a (not used) |
| `email_templates` | yes (live, orphan) | 2 conflicting schemas | 5 rows via init route | Bypassed by hardcoded `EMAIL_TEMPLATES` constant | DISABLED | `{{contact_name}}` etc — works in init seed |
| `module_templates` | yes (live, orphan) | NONE in live repo | NONE | Only referenced in `_merge-incoming/` dead text dump | DISABLED | n/a (not used) |

Counts in the task header (6/18/8/42) appear to come from a live DB snapshot — none of those exact counts are reproducible from the repo's seed data.

---

## 1. project_templates

### Schema
- `api-server/src/migrations/task243_pm_risk_documents_changeorders_templates.sql:60-69` (CREATE TABLE)
- `lib-client/db/src/schema/project-templates.ts` and `AI-Task-Manager/lib/db/src/schema/project-templates.ts` (drizzle, identical)

### Seed
Migration `task243_*.sql:72-76` inserts **3 templates only** (`installation`, `manufacturing`, `service`) — not 6. The reported count of 6 implies live insertions or a separate seed script not committed.

### API Routes
`api-server/src/routes/project-pm-extended.ts:303-411`
- `GET /project-templates`, `POST /project-templates`, `PUT /project-templates/:id`, `DELETE /project-templates/:id`
- `POST /project-templates/:id/create-project` — instantiates a project from the template
- `POST /project-templates/save-from-project/:projectId` — reverse direction

### Wiring Bug — ROUTE MISMATCH (HIGH)
- Router is mounted at `/api/project-pm-extended` (`api-server/src/routes/index.ts:845`)
- UI page calls `/api/project-templates` directly (`erp-app/src/pages/projects/project-templates-page.tsx:74`)
- Real URL would be `/api/project-pm-extended/project-templates` — UI fetch returns 404, page falls back to empty array silently (`if (r.ok) setItems(...)`).
- Either the route group should be split off (mount router at `/`) or the UI fetch URL must be corrected. Same applies to `/project-change-orders`, `/project-documents`, `/project-risk-assessments` — all under same router.

### Variables
`template_data.tasks[].title|duration|phase`, `riskCategories`, `budgetCategories` — consumed by `create-project` endpoint to clone tasks; resolution logic is plain field copy (no token interpolation needed). Hebrew text in seed renders correctly.

---

## 2. workflow_templates

### Schema
**No CREATE TABLE found anywhere in the live repo.** The table exists in the live Supabase project (per `_qa-reports-25/AGENT-09-db-integrity.md:38,67`) but is listed as orphan (no inbound or outbound FK). It must have been created by a script that was never persisted to migrations.

### Seed
None in the repo.

### UI
`erp-app/src/pages/documents/approval-workflows.tsx:62-69` defines a hardcoded `FALLBACK_WORKFLOW_TEMPLATES` array (6 items). The page calls `GET /api/documents/approval-workflows` (line 125), but **no such API route exists** — the search for that endpoint returned zero matches in `api-server/`. The page therefore always renders the fallback.

### Status: STALE
- 18 rows in live DB are unreachable: no schema in repo, no API to fetch them, no UI consumer, no RLS.

---

## 3. email_templates

### Schema (CONFLICT — two different definitions)

A. **Drizzle/lib-client** (`lib-client/db/src/schema/email-templates.ts:3-16`)
   - Columns: `name`, `category`, `subject`, `body_html`, `body_text`, `is_rtl`, `variables jsonb default []`, `attachment_config`, `is_active`, ...

B. **Comm-marketing init route** (`api-server/src/routes/communication-marketing-engine.ts:41-57`)
   - Columns: `template_name`, `template_name_he`, `category`, `subject`, `subject_he`, `body_html`, `body_text`, `variables`, `design_theme`, `attachments`, `usage_count`, `status`, ...

These columns do not match. The `init` endpoint runs `CREATE TABLE IF NOT EXISTS`, so whichever side ran first wins; the drizzle schema would then be wrong against the live shape, and any drizzle-typed query would fail.

### Seed
Comm-marketing init route inserts **5 rows** (welcome, quote_pdf, contract, invoice, thank_you) at `communication-marketing-engine.ts:165-171`. Reported count of 8 in the task header could not be reproduced.

### Variables
Bilingual `{{contact_name}}`, `{{quote_number}}`, `{{amount}}`, `{{valid_until}}`, `{{project_name}}`, `{{invoice_number}}`, `{{due_date}}`, `{{company_name}}`. The `variables` jsonb column lists declared placeholders but **no resolver implementation in this repo actually reads from `email_templates`** — every consumer either:
- Uses inline templates (`onyx-procurement/src/emails/email-templates.js`, `onyx-procurement/src/comms/email-templates.js`)
- Uses a hardcoded `EMAIL_TEMPLATES` constant inside `crm/pipeline.js:886-920`
- Or, for the agent (`onyx-ai/agents/src/tools/emailTemplateTool.ts`), generates HTML files into `src/emails/templates/*.html` on disk — never reads from the table.

### Status: STALE
The `email_templates` DB table is dead-storage. RLS disabled (AGENT-09). The variable substitution that would resolve `{{contact_name}}` etc. exists only in the file-based path (lines 41-43 of `emailTemplateTool.ts`), not against rows from this table.

---

## 4. module_templates

### Schema
**Not present in the live repo.** Lives only in `_merge-incoming/techno-uzi-erp/.../imported-from-drive/text/Cloud IDE Hub - Marketplace Dashboard Page (marketplace-dashboard.tsx)` — a text dump from Google Drive of an **unrelated Cloud IDE marketplace product**, not part of the ERP. References:
- `supabaseFetch('module_templates', 'order=install_count.desc&limit=10')`
- `supabaseFetch('marketplace_revenue', '...select=*,module_templates:module_id(name)...')`

### Seed
None.

### Wiring
None in active code.

### Status: DEAD / WRONG-PRODUCT
- 42 rows in live DB belong to a different product that was imported but never integrated. RLS disabled. Should be dropped or moved to a separate Supabase project.

---

## Cross-Cutting Issues

1. **All 4 tables have RLS DISABLED** (`_qa-reports-25/AGENT-09-db-integrity.md:51-67`). They are world-readable. `email_templates` rows may contain PII in subjects.
2. **Two of four are orphans** (no FKs in or out): `email_templates`, `module_templates`, `project_templates`, `workflow_templates` — all listed as orphaned in AGENT-09.
3. **No tenant_id on any of them** — once tenant isolation is enabled in the platform, every customer would see every other customer's templates.
4. **Variable resolver is split across 4+ implementations** with different `{{...}}` formats. There is no central `renderTemplate(name, vars)` service.
5. **The `_merge-incoming/` and `AI-Task-Manager/artifacts/` trees mirror live code** — refactors landed only in one of three locations risk drifting further apart.

---

## Recommendations (priority order)

1. **Fix the project-templates route mismatch** (HIGH, easy): either split `project-pm-extended.ts` into `project-templates.ts` mounted at `/`, or update `erp-app/src/pages/projects/project-templates-page.tsx:74` and the wizard `start-date` POST to `/api/project-pm-extended/project-templates`. Zero data is currently reaching the UI.
2. **Persist a CREATE TABLE migration for `workflow_templates`** or drop the live table; build the `/api/documents/approval-workflows` route the UI expects, or remove the API call.
3. **Decide which `email_templates` schema is canonical** and reconcile. Update the drizzle file, drop the conflicting `CREATE TABLE IF NOT EXISTS` in the init route, and route every email producer through one helper that reads from this table with variable substitution.
4. **Drop `module_templates`** from the live DB or migrate it out — it is not part of the ERP product surface.
5. **Add RLS + tenant_id** to all four template tables before exposing to multi-tenant traffic.
6. **Centralize variable rendering** behind a single `lib/templates/render.ts` shared across email/SMS/WhatsApp/project flows.

---

## Key Files

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\migrations\task243_pm_risk_documents_changeorders_templates.sql`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\project-pm-extended.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\communication-marketing-engine.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\index.ts` (router mount)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\lib-client\db\src\schema\project-templates.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\lib-client\db\src\schema\email-templates.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\projects\project-templates-page.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\documents\approval-workflows.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\agents\src\tools\emailTemplateTool.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-09-db-integrity.md` (cross-reference)
