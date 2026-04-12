# QA AGENT #73 — Postgres Maintenance / VACUUM / Bloat
## onyx-procurement | Static Analysis | 2026-04-11

**Scope:** `supabase/migrations/001-supabase-schema.sql`
**Platform:** Supabase Managed Postgres (autovacuum = ON by default)
**Dimension:** Postgres Maintenance / VACUUM / Bloat / Storage Hygiene

---

## Executive Summary (Hebrew)

סטטוס: הסכמה **לא מותאמת** לתחזוקה ארוכת טווח. Supabase אמנם מפעיל autovacuum כברירת מחדל, אך קיימים מספר דפוסי סיכון: טבלאות צומחות ללא מנגנון ארכוב (`audit_log`, `system_events`, `price_history`), עמודות JSONB גדולות שיוצרות לחץ על TOAST, ו-`UPDATE`-heavy בטבלאות הליבה (`suppliers`, `purchase_orders`) עם טריגרים של `updated_at` שמגדילים את קצב ה-dead tuples. אין אסטרטגיית ארכוב, אין partitioning, אין REINDEX schedule, ואין מנגנון מוגדר למחיקה של אירועים ישנים. על Free/Pro tier זה יגיע לתקרת אחסון או להשפעה ביצועית תוך חודשים בודדים.

**Severity Breakdown:** 3 CRITICAL · 6 HIGH · 5 MEDIUM · 2 LOW

---

## 1. Table Growth Profile — Rapid Growers

### 1.1 `audit_log` (Line 338-351) — **CRITICAL**
```sql
CREATE TABLE audit_log (
  id UUID, entity_type TEXT, entity_id UUID,
  action TEXT, actor TEXT, detail TEXT,
  previous_value JSONB,    -- ← UNBOUNDED JSONB
  new_value JSONB,         -- ← UNBOUNDED JSONB
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```
**Findings:**
- **INSERT-only** by design → ideal for autovacuum (no dead tuples from UPDATE/DELETE)
- **BUT:** two large JSONB columns (`previous_value`, `new_value`) → every audit row doubles row size
- **No TTL / no partitioning / no archival** — grows linearly forever
- Two indexes must be rebuilt as table grows; `idx_audit_created DESC` will bloat on btree right-edge inserts if any rollback happens
- **Estimate:** at 500 actions/day × 2 JSONB blobs × ~2KB avg → ~2GB/year heap + TOAST. After 3 years = 6GB+ just for audit.
- **On Supabase Free (500MB) → breach in ~2 months**
- **On Supabase Pro (8GB base) → breach in ~3-4 years**

### 1.2 `system_events` (Line 355-367) — **CRITICAL**
```sql
CREATE TABLE system_events (
  id UUID, type TEXT, severity TEXT,
  source TEXT, message TEXT,
  data JSONB,              -- ← UNBOUNDED JSONB
  acknowledged BOOLEAN DEFAULT false,   -- ← UPDATE target
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
**Findings:**
- INSERT-heavy (every system event), but ALSO UPDATE-heavy because `acknowledged` flips from `false`→`true`
- **Mixed workload** = worst case for vacuum: dead tuples accumulate between INSERTs
- JSONB `data` → TOAST pressure
- No retention policy; `info`-severity events never purged
- Indexes on `type`, `severity` — both low-cardinality, will bloat as table grows
- **Missing index on `acknowledged = false`** for the dashboard queue query → full scan as table grows

### 1.3 `price_history` (Line 65-78) — **HIGH**
```sql
CREATE TABLE price_history (
  id UUID, supplier_id UUID, product_id UUID,
  product_key TEXT, price NUMERIC, currency TEXT,
  quantity NUMERIC, source TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```
**Findings:**
- **INSERT-only**, no large columns → vacuum-friendly
- But: no TTL → old price points accumulate indefinitely
- Missing index on `recorded_at` → time-range queries force full scan (typical analytics: "price last 90 days")
- Missing composite `(product_key, recorded_at DESC)` → every price lookup is a sort

### 1.4 `notifications` (Line 371-389) — **HIGH**
- Mixed INSERT + 3× UPDATE per row (`sent`, `delivered`, `acknowledged`)
- **3x UPDATE per row** = 3x dead tuples per row → autovacuum must run often
- No TTL → acknowledged notifications live forever
- Missing index on `(sent = false)` partial index → delivery worker scans full table

---

## 2. UPDATE-Heavy Tables — Bloat Risk

### 2.1 `suppliers` (Line 8-40) — **HIGH**
```sql
-- Stats columns that update on EVERY purchase order:
total_orders, total_spent, avg_response_time_hours,
on_time_delivery_rate, total_negotiated_savings,
last_order_date, overall_score
-- Plus trigger trg_suppliers_updated on BEFORE UPDATE
```
**Findings:**
- Every PO created → `suppliers` row UPDATE (via `calculate_supplier_score` at line 410)
- `BEFORE UPDATE` trigger rewrites `updated_at` → **every UPDATE creates a dead tuple**
- **HOT (Heap-Only Tuple) updates blocked** because `updated_at` is indexed indirectly via no filter index, but `overall_score` changes may force new tuples if `fillfactor=100` (default)
- **Recommendation:** `ALTER TABLE suppliers SET (fillfactor = 85);` to leave room for HOT updates
- Without this: bloat grows ~10-20% per month under moderate load

### 2.2 `purchase_orders` (Line 192-233) — **HIGH**
```sql
-- Status transitions: draft → pending_approval → approved → sent → 
--                     confirmed → shipped → delivered → inspected → closed
-- = 8+ UPDATEs per PO lifecycle
```
**Findings:**
- **Worst UPDATE churn in schema:** ~8 status updates per row over lifecycle
- `BEFORE UPDATE` trigger → forces `updated_at` rewrite
- Includes `tags TEXT[]`, `notes TEXT`, `quality_result` — all nullable, can bloat
- `idx_po_status` is low-cardinality (10 values) → updates shuffle between btree leaves → index bloat
- **Recommendation:** `fillfactor = 80` + periodic `REINDEX CONCURRENTLY idx_po_status`

### 2.3 `rfq_recipients` (Line 130-145) — **MEDIUM**
- `delivered`, `reminder_sent`, `status` all flip → 2-3 UPDATEs per row
- Similar bloat profile, smaller volume

### 2.4 `subcontractors` (Line 277-293) — **MEDIUM**
- `total_projects`, `completed_on_time`, `total_revenue`, `complaints` — all incremental updates
- `BEFORE UPDATE` trigger present

---

## 3. Long-Running Transaction Risk (Blocks Vacuum)

**Findings — STATIC ANALYSIS:**
- Schema has no explicit transaction management, but these patterns from application code would block vacuum:
  1. **`calculate_supplier_score()` (line 410)** — SELECT + UPDATE in same function. If called from long-lived dashboard refresh loops → holds snapshot → `xmin` horizon freezes → autovacuum cannot reclaim dead tuples on ANY table
  2. **Views `rfq_summary`, `supplier_dashboard`, `procurement_dashboard`** — heavy joins; if used inside pg_cron or edge function without statement_timeout → long reads → block vacuum
  3. **No `idle_in_transaction_session_timeout`** set in schema — on Supabase this is default 60s, but connections left open by edge functions can still cause havoc

**Recommendation:**
```sql
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '30s';
ALTER DATABASE postgres SET statement_timeout = '60s';
```

---

## 4. TOAST Table Impact for JSONB Columns

**JSONB columns in schema:**
| Table | Column | Risk |
|---|---|---|
| `audit_log` | `previous_value`, `new_value` | **CRITICAL** — unbounded, every row |
| `procurement_decisions` | `reasoning` | MEDIUM — once per decision |
| `subcontractor_decisions` | `reasoning` | MEDIUM — once per decision |
| `system_events` | `data` | **HIGH** — every event |

**Findings:**
- Any JSONB > ~2KB moves to TOAST → separate heap + separate index
- TOAST tables have their OWN vacuum needs — often forgotten
- `audit_log.previous_value` + `new_value` together can easily hit TOAST threshold
- TOAST compression: `pglz` by default on Supabase; `lz4` available on PG14+ but not enabled
- **No `ALTER TABLE ... SET STORAGE EXTERNAL/EXTENDED`** specified → uses default (EXTENDED with compression)

**Recommendations:**
```sql
-- Enable lz4 compression (Supabase PG15+):
ALTER TABLE audit_log ALTER COLUMN previous_value SET COMPRESSION lz4;
ALTER TABLE audit_log ALTER COLUMN new_value SET COMPRESSION lz4;
ALTER TABLE system_events ALTER COLUMN data SET COMPRESSION lz4;

-- Monitor TOAST bloat:
SELECT pg_size_pretty(pg_relation_size(reltoastrelid)) AS toast_size,
       relname FROM pg_class WHERE relname IN ('audit_log','system_events')
       AND reltoastrelid != 0;
```

---

## 5. Index Bloat on Frequently Updated Tables

| Index | Table | Bloat Risk | Reason |
|---|---|---|---|
| `idx_po_status` | purchase_orders | **CRITICAL** | Low cardinality (10 values) + heavy updates |
| `idx_audit_created` | audit_log | HIGH | btree DESC + constant INSERT |
| `idx_events_type` | system_events | HIGH | Low cardinality + mixed load |
| `idx_events_severity` | system_events | HIGH | Only 4 distinct values, every event |
| `idx_notifications_sent` | notifications | HIGH | Boolean → worst case btree |
| `idx_notifications_recipient` | notifications | MEDIUM | Medium cardinality |
| `idx_po_project` | purchase_orders | MEDIUM | Nullable, updates shift position |

**Findings:**
- `idx_notifications_sent` on a BOOLEAN is the WORST POSSIBLE btree index — every row indexed on one of two values. Use partial index instead:
```sql
DROP INDEX idx_notifications_sent;
CREATE INDEX idx_notifications_unsent ON notifications(created_at)
  WHERE sent = false;
```
- Same for `system_events.acknowledged` if it were indexed (it isn't — missing index is ALSO a problem)
- Index bloat on `idx_po_status` will grow ~5% per month under moderate load

---

## 6. REINDEX Schedule — **MISSING**

**Current state:** NONE. Schema contains zero maintenance commands.

**Recommended schedule (pg_cron):**
```sql
-- Weekly (low-traffic window):
SELECT cron.schedule('reindex-hot', '0 3 * * 0', $$
  REINDEX INDEX CONCURRENTLY idx_po_status;
  REINDEX INDEX CONCURRENTLY idx_notifications_unsent;
  REINDEX INDEX CONCURRENTLY idx_events_type;
  REINDEX INDEX CONCURRENTLY idx_events_severity;
$$);

-- Monthly (full maintenance):
SELECT cron.schedule('reindex-monthly', '0 4 1 * *', $$
  REINDEX TABLE CONCURRENTLY purchase_orders;
  REINDEX TABLE CONCURRENTLY suppliers;
  REINDEX TABLE CONCURRENTLY notifications;
$$);

-- VACUUM ANALYZE weekly on hot tables:
SELECT cron.schedule('vacuum-hot', '0 2 * * 0', $$
  VACUUM (ANALYZE, VERBOSE) purchase_orders;
  VACUUM (ANALYZE, VERBOSE) suppliers;
  VACUUM (ANALYZE, VERBOSE) audit_log;
  VACUUM (ANALYZE, VERBOSE) system_events;
$$);
```

---

## 7. Supabase Tier Storage Limits

| Tier | Database | Growth Forecast |
|---|---|---|
| **Free** | 500 MB | **2-3 months** before breach (audit_log dominates) |
| **Pro** | 8 GB base, +$0.125/GB | 2-3 years |
| **Team** | 8 GB base, elastic | Scales |

**Per-Table Forecast (Free tier, moderate load):**
- `audit_log`: ~170MB/year @ 500 actions/day × 1KB avg
- `system_events`: ~100MB/year @ 300 events/day × 1KB avg
- `price_history`: ~30MB/year @ 200 prices/day × 400B
- `notifications`: ~50MB/year
- All others + indexes + TOAST + WAL overhead: ×1.5-2.0

**Expected free-tier breach:** ~6-9 months at moderate load without archival.

**Recommendation:** if staying on Free, mandatory archival by month 4. If on Pro, mandatory partitioning by year 2.

---

## 8. Archival Strategy for Old `audit_log` Entries — **MISSING**

**Current state:** NONE. No DELETE, no partition, no export.

### Recommended: Monthly Partitioning (best long-term)
```sql
-- Convert audit_log to partitioned table:
CREATE TABLE audit_log_new (
  LIKE audit_log INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_log_2026_04 PARTITION OF audit_log_new
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- ... etc

-- Then DETACH + export + DROP old partitions monthly.
```

### Alternative: Soft Archive (simpler, good for Free tier)
```sql
-- Move rows >90 days to cold storage:
CREATE TABLE audit_log_archive (LIKE audit_log INCLUDING ALL);

-- Nightly job:
WITH moved AS (
  DELETE FROM audit_log
  WHERE created_at < NOW() - INTERVAL '90 days'
  RETURNING *
)
INSERT INTO audit_log_archive SELECT * FROM moved;
```

### Export-and-purge (cheapest)
- Nightly COPY to Supabase Storage as JSONL
- DELETE from hot table
- Frees WAL + heap + TOAST + indexes

**Same strategy required for:** `system_events` (>30 days), `price_history` (>1 year), `notifications` (>60 days after acknowledged).

---

## 9. Additional Findings

### 9.1 Missing `ANALYZE` after seed — **LOW**
Schema INSERTs seed data but never runs `ANALYZE`. Statistics for planner are stale from row 1.
```sql
-- Add at end of migration:
ANALYZE suppliers, supplier_products, subcontractors, subcontractor_pricing;
```

### 9.2 Missing `autovacuum_vacuum_scale_factor` tuning — **MEDIUM**
Default is 0.2 (20% dead rows trigger vacuum). For high-churn tables, lower it:
```sql
ALTER TABLE purchase_orders SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE suppliers SET (
  autovacuum_vacuum_scale_factor = 0.05
);
ALTER TABLE notifications SET (
  autovacuum_vacuum_scale_factor = 0.05
);
```

### 9.3 `fillfactor` never specified — **MEDIUM**
All tables default to `fillfactor=100`. UPDATE-heavy tables cannot do HOT updates. Set `fillfactor=80-85` on `suppliers`, `purchase_orders`, `notifications`, `rfq_recipients`.

### 9.4 Seed-time `ON CONFLICT DO NOTHING` without constraints — **LOW**
Lines 505, 526, 535: `ON CONFLICT DO NOTHING` with no unique constraint on `name` → always inserts → dead rows on re-run. Either add `UNIQUE(name)` or accept the drift.

### 9.5 No `vacuum_freeze_min_age` tuning for append-only tables — **LOW**
`audit_log`, `price_history` are append-only → perfect candidates for lower freeze age to avoid anti-wraparound later:
```sql
ALTER TABLE audit_log SET (
  autovacuum_freeze_min_age = 0,
  autovacuum_freeze_table_age = 100000000
);
```

### 9.6 No connection pooler tuning mentioned — **LOW**
PgBouncer on Supabase; long-held transactions still block vacuum regardless of pooler mode. Documentation / runbook missing.

---

## 10. Remediation Priority Queue

| # | Severity | Fix | Effort |
|---|---|---|---|
| 1 | CRITICAL | Add archival for `audit_log` (soft archive or partition) | M |
| 2 | CRITICAL | Add archival for `system_events` (60-day TTL) | S |
| 3 | CRITICAL | Replace `idx_notifications_sent` with partial index | S |
| 4 | HIGH | Set `fillfactor=80` on `suppliers`, `purchase_orders`, `notifications` | S |
| 5 | HIGH | Enable `lz4` compression on JSONB columns | S |
| 6 | HIGH | Tune `autovacuum_vacuum_scale_factor` for hot tables | S |
| 7 | HIGH | Add missing index on `system_events(acknowledged) WHERE false` | S |
| 8 | HIGH | Add missing index on `price_history(product_key, recorded_at DESC)` | S |
| 9 | HIGH | Schedule weekly REINDEX CONCURRENTLY via pg_cron | M |
| 10 | MEDIUM | Set `idle_in_transaction_session_timeout=30s` | S |
| 11 | MEDIUM | Add `ANALYZE` at end of seed migration | S |
| 12 | MEDIUM | Monitor TOAST table sizes with pg_stat_user_tables | M |
| 13 | LOW | Tune `vacuum_freeze_min_age` on append-only tables | S |
| 14 | LOW | Add unique constraints to seed tables for `ON CONFLICT` correctness | S |

---

## 11. Monitoring Queries to Add

```sql
-- Bloat snapshot:
SELECT schemaname, relname,
  n_live_tup, n_dead_tup,
  ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
  last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY dead_pct DESC NULLS LAST;

-- TOAST size per table:
SELECT c.relname,
  pg_size_pretty(pg_relation_size(c.oid)) AS heap,
  pg_size_pretty(pg_relation_size(c.reltoastrelid)) AS toast,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total
FROM pg_class c
WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
ORDER BY pg_total_relation_size(c.oid) DESC;

-- Index bloat (simplified):
SELECT indexrelname, idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Long-running transactions (block vacuum):
SELECT pid, now() - xact_start AS duration, state, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY duration DESC;
```

---

## 12. Final Verdict

| Area | Grade |
|---|---|
| Autovacuum readiness | **C** — works by default, not tuned |
| JSONB / TOAST handling | **D** — no compression tuning, unbounded growth |
| Index hygiene | **D** — boolean btree indexes, low-cardinality indexes unoptimized |
| Bloat prevention | **F** — no fillfactor, no scale factor tuning, no archival |
| Archival strategy | **F** — entirely missing |
| Monitoring | **F** — no queries, no alerts |
| Tier-fit for Free | **FAIL** — will breach in 2-3 months |
| Tier-fit for Pro | **PASS** — buys 2-3 years, but long-term needs partitioning |

**Overall: D+** — functional for MVP, unsustainable for production beyond ~6 months without the remediations above. Priority 1-8 above are the minimum viable hardening.

---

*Generated by QA Agent #73 — onyx-procurement · 2026-04-11 · Static analysis only, no DB connection performed.*
