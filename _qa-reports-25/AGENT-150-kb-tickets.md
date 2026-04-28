# AGENT-150 — Knowledge Base + Support Tickets Audit

**Agent:** 150
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Scope:** `knowledge_base` (10 rows) + `support_tickets` (4 rows). Cross-reference legacy QA reports (`AG-X21-ticketing.md`, `AG-X22-knowledge-base.md`) against the current schema, routes, and UI.
**Verdict:** **PARTIAL** — feature work landed but the production schema fragmented into 3 parallel implementations, the legacy `public.knowledge_base` and `public.support_tickets` rows have no FK / RLS / route, and SLA / versioning are de-facto missing on the canonical comms.* tables.

---

## 1. Inventory — three parallel implementations

| Layer | KB table | Tickets table | SLA | Versioning |
|---|---|---|---|---|
| **A. Canonical schema** (`supabase/migrations/00000_master_schema.sql:1886,1905`) | `comms.help_articles` | `comms.support_tickets` | `comms.support_sla_tracking` (2 variants — see §4) | none |
| **B. Legacy startup migrations** (`api-server/src/app.ts:275`, `api-server/src/lib/startup-migrations.ts:852`) | `service_knowledge_base` (only via `customer-service-ai-engine.ts`) | `public.support_tickets` (two competing CREATEs) | none | none |
| **C. AGENT X-21 / X-22 deliverables** (zero-deps in-memory) | `onyx-procurement/src/kb/kb-engine.js` | `onyx-procurement/src/support/ticketing.js` | `SLA_RULES` matrix in JS | `versions[]` per article |

**Row counts referenced in task brief:** `knowledge_base` = 10 (matches X-22's 10 seeded bilingual articles; FALLBACK_ARTICLES in `erp-app/src/pages/knowledge/knowledge-base.tsx:11` lists 15 different items pointing to the orphan `public.knowledge_base`). `support_tickets` = 4 rows is consistent with smoke-test data in `public.support_tickets`.

---

## 2. `knowledge_base` audit (10 rows)

### 2.1 Schema reality
- `public.knowledge_base` — **orphan table**, no FK in or out, RLS DISABLED (per `_qa-reports-25/AGENT-09-db-integrity.md:38,61`). No CREATE TABLE statement located in current migrations; survives only as a schema scan artefact and as the GET target of `erp-app/src/pages/knowledge/knowledge-base.tsx:65` (`/api/knowledge/knowledge_base` — endpoint **not registered** anywhere in `api-server/src/routes`).
- `comms.help_articles` — canonical, RLS-enabled (`00001_rls_helpers_and_policies.sql:289,685`), backed by router at `api-server/src/routes/comms/help-articles.ts` mounted at `/api/comms/help-articles`.
- `service_knowledge_base` — owned by `customer-service-ai-engine.ts:75`, 12 seeded HE/EN troubleshooting articles, fields: `title/title_he/category/subcategory/problem_description/solution/solution_he/keywords/helpful_count/not_helpful_count/auto_suggest/status`.

### 2.2 Search
| Implementation | Mechanism | Hebrew-aware |
|---|---|---|
| `kb-engine.js` (X-22) | BM25-lite + nikud stripping + stop-words + external bridge | YES (test 21) |
| `comms.help_articles` REST | `ILIKE '%query%'` on title/body/article_code (`help-articles.ts:30`) | partial — no nikud, no ranking |
| `service_knowledge_base` | substring + tag JSON match (`customer-service-ai-engine.ts:500,766`) | partial |
| `knowledge-base.tsx` UI | client-side `Array.filter` on FALLBACK_ARTICLES | none |

**Gap:** the production REST surface (`comms/help-articles`) does **not** call the X-22 BM25 engine, and the UI page does not call `comms/help-articles` either — it calls a phantom `/api/knowledge/knowledge_base`.

### 2.3 Categories
- `comms.help_articles.category` — flat text column, no FK to a categories table.
- `kb-engine.js` — hierarchical (`benefits`, `social` parented under `payroll`), with FAQ blocks per category (test 13).
- UI — 8 hard-coded categories in `knowledge-base.tsx:29-38`.

**Gap:** no `comms.help_categories` table; hierarchy lives only in X-22's in-memory engine.

### 2.4 Article versioning
- `comms.help_articles` — **NO `version` column**, no `help_article_versions` table. Edits overwrite in place. (`docs.document_versions` exists in `00010_enterprise_expansion_30_tables.sql:589` but is unrelated.)
- `kb-engine.js` — full snapshot per `updateArticle()`, monotonic version counter, `diffVersions()` token-level diff (X-22 tests 4, 5, 18).
- `service_knowledge_base` — no versioning.

**Gap (CRITICAL):** never-delete + versioning rule from X-22 is NOT enforced at the database layer. `help-articles.ts:101` performs a soft-delete (`is_deleted=true`) but writes destroy prior content.

---

## 3. `support_tickets` audit (4 rows)

### 3.1 Three competing definitions

| Source | Schema | Status enum | Priority |
|---|---|---|---|
| `comms.support_tickets` (canonical) | `state text default 'Open'` then `status` added with check `('open','in_progress','waiting_customer','resolved','closed')` (`00065:190`) | EN | EN |
| `public.support_tickets` (`app.ts:275`) | `status default 'open'`, `priority default 'medium'`, no FKs, **no `customer_name` / `subject` / `category` / `assigned_to` / `ticket_number`** | EN | EN |
| `public.support_tickets` (`startup-migrations.ts:852`) | adds `ticket_number/customer_name/subject/category/assigned_to/resolution_notes` | EN | EN |
| Hebrew variant (`hr-enterprise.ts:1041,1050`) | reads `status='בטיפול'/'סגור'`, writes `'פתוח'/'רגיל'` | **HE** | **HE** |
| UI (`erp-app/src/pages/support/tickets.tsx:23,93`) | `["פתוח","בטיפול","ממתין ללקוח","סגור"]`, `["נמוך","רגיל","גבוה","דחוף"]` | **HE** | **HE** |

**Gap (CRITICAL):** UI sends Hebrew enum values to `/api/support-tickets` (`hr-enterprise.ts`) which writes them to `public.support_tickets`. The `comms/support-tickets` router enforces an English check constraint that would **reject** these payloads. The 4 production rows live in `public.support_tickets`, not in `comms.support_tickets`.

### 3.2 SLA
- **X-21 design:** in-memory pause/resume, urgent=2h/8h, high=4h/24h, med=8h/72h, low=24h/7d.
- **`comms.support_sla_tracking` v1** (`00011:659`): `first_response_due_at / first_response_at / resolution_due_at / resolved_at / first_response_breached / resolution_breached`. Schema-only — never wired.
- **`comms.support_sla_tracking` v2** (`00065:265`): different shape (`sla_type / target_at / actual_at / status`), `unique` on `support_ticket_id` from v1 collides with the `ticket_id` FK in v2. Both definitions ship; **migration order is non-deterministic** since 00011 runs before 00065 but uses `IF NOT EXISTS`.
- `support-tickets.ts:54-64` joins `support_sla_tracking` on `ticket_id` and reads v2 columns — works only when v2 wins the race.
- `public.support_tickets` rows (the 4 actually used) get **no SLA at all** — none of the SLA logic from X-21 or `support-tickets.ts` runs against the public schema.

**Gap (CRITICAL):** SLA is a design artefact, not a working feature on the live data path.

### 3.3 Status state machine vs. AG-X21 promise
| AG-X21 promised | comms.support_tickets has | public.support_tickets has |
|---|---|---|
| `open / in_progress / waiting / resolved / closed` w/ pause-on-wait | check (`open/in_progress/waiting_customer/resolved/closed`) | text default `'open'`, no constraint |
| `paused_ms`, `paused_since`, `first_response_at` | metadata jsonb (free-form), no dedicated columns | metadata not present |
| 91-transition state machine (per `pipeline/state-machines.js`) | not enforced; PATCH accepts any value (`support-tickets.ts:108`) | not enforced |

---

## 4. Cross-cutting gaps

| # | Gap | Severity | Evidence |
|---|---|---|---|
| 1 | Phantom KB API: UI calls `/api/knowledge/knowledge_base` (no router exists) | HIGH | `knowledge-base.tsx:65`, no match in `api-server/src/routes/**` |
| 2 | Three parallel `support_tickets` schemas with incompatible enums and overlapping CREATEs | CRITICAL | `app.ts:275` + `startup-migrations.ts:852` + `00000_master_schema.sql:1886` |
| 3 | Hebrew-string enum collision: UI writes Hebrew, canonical schema rejects it | CRITICAL | `tickets.tsx:23,93` vs. `00065:190` |
| 4 | Two competing `support_sla_tracking` shapes; race on migration order | HIGH | `00011:659` vs. `00065:265` |
| 5 | KB versioning undefined at DB layer (no `help_article_versions`, no `version` column) | HIGH | `00000_master_schema.sql:1905-1916` |
| 6 | `public.support_tickets` and `public.knowledge_base` have RLS disabled | CRITICAL | `AGENT-09-db-integrity.md:38,61,65` |
| 7 | No FK indexes on `comms.support_sla_tracking.ticket_id` join (v1 has `unique`, v2 indexed but not v1) | MEDIUM | `00011:659-670` |
| 8 | `support_tickets.status` lacks CHECK constraint (public variant) | MEDIUM | `AGENT-09-db-integrity.md:43` |
| 9 | X-22 BM25 engine never bridged to `comms/help-articles` route — search degrades to ILIKE | MEDIUM | `help-articles.ts:30` |
| 10 | `comms.help_articles` lacks helpful_count/not_helpful_count getters in REST router (column added by 00065:208 but not exposed) | LOW | `help-articles.ts` PATCH whitelist |

---

## 5. Recommendations (priority-ordered)

1. **Pick one schema** for `support_tickets`: drop `public.support_tickets` and `service_knowledge_base`, route everything through `comms.support_tickets` + `comms.help_articles`. Add a migration that copies the 4 prod rows + 10 KB rows over.
2. **Bilingual enum bridge**: server-side translate `'פתוח'→'open'`, `'דחוף'→'urgent'` in `comms/support-tickets` router so the UI can keep its Hebrew labels without violating the check constraint.
3. **Reconcile `support_sla_tracking`**: drop the v1 (`00011`) definition, keep v2 (`00065`), add a guarded migration. Wire X-21's pause-on-wait math into PATCH `/comms/support-tickets/:id` so SLA rows actually get written.
4. **Add `comms.help_article_versions`** table (article_id FK, version int, body, title, edited_by, edited_at) and snapshot in `help-articles.ts` PATCH before update — port X-22's `versions[]` invariant to SQL.
5. **Wire `kb-engine.js` BM25** behind `/api/comms/help-articles?q=` (the engine already accepts `opts.externalSearch`).
6. **Add CHECK constraints** on status/priority in `comms.support_tickets`; enable RLS on the leftover orphans or drop them.
7. **Register `/api/knowledge/*`** OR fix the UI to call `/api/comms/help-articles` — the FALLBACK_ARTICLES array masks a hard 404.

---

## 6. Files inspected (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00000_master_schema.sql` (lines 1886-1916)
- `...\supabase\migrations\00011_enterprise_expansion_30_more_tables.sql` (lines 659-670)
- `...\supabase\migrations\00065_comms_domain_complete.sql` (lines 190-282, 455-458)
- `...\supabase\migrations\00001_rls_helpers_and_policies.sql` (lines 289, 685)
- `...\api-server\src\routes\comms\support-tickets.ts` (full)
- `...\api-server\src\routes\comms\help-articles.ts` (full)
- `...\api-server\src\routes\comms\index.ts` (mount points)
- `...\api-server\src\routes\customer-service-ai-engine.ts` (lines 60-130, seeds)
- `...\api-server\src\routes\hr-enterprise.ts` (lines 1040-1064)
- `...\api-server\src\routes\sales-pricing-enterprise.ts` (lines 580-605)
- `...\api-server\src\app.ts` (lines 274-286)
- `...\api-server\src\lib\startup-migrations.ts` (lines 852-867)
- `...\erp-app\src\pages\support\tickets.tsx` (lines 1-100)
- `...\erp-app\src\pages\knowledge\knowledge-base.tsx` (full)
- `...\onyx-procurement\src\support\ticketing.js` (per AG-X21 spec)
- `...\onyx-procurement\src\kb\kb-engine.js` (per AG-X22 spec)
- `...\_qa-reports\AG-X21-ticketing.md`
- `...\_qa-reports\AG-X22-knowledge-base.md`
- `...\_qa-reports-25\AGENT-09-db-integrity.md` (lines 38-101)

---

**Signed:** Agent 150 / 2026-04-29
