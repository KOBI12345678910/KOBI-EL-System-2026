# QA Agent #71 — Database Query Performance (heuristic)

**System:** onyx-procurement
**Date:** 2026-04-11
**Dimension:** Database Query Performance (Supabase / PostgreSQL)
**Method:** Static analysis only — static heuristic (no runtime EXPLAIN ANALYZE)
**Files inspected:**
- `onyx-procurement/supabase/migrations/001-supabase-schema.sql` (562 lines)
- `onyx-procurement/server.js` (934 lines)

---

## 1. Full inventory of Supabase queries in `server.js`

| # | Line | Endpoint | Table / View | Operation | Filter cols | Order / Limit | SELECT shape |
|---|------|----------|--------------|-----------|-------------|---------------|--------------|
| 1 | 100 | `audit()` helper | `audit_log` | INSERT | – | – | – |
| 2 | 112 | `GET /api/status` | `procurement_dashboard` (view) | SELECT `.single()` | – | – | `*` |
| 3 | 131–134 | `GET /api/suppliers` | `supplier_dashboard` (view) | SELECT | – | `order(overall_score DESC)` | `*` |
| 4 | 141 | `GET /api/suppliers/:id` | `suppliers` | SELECT `.single()` | `id` (PK) | – | `*` |
| 5 | 142 | `GET /api/suppliers/:id` | `supplier_products` | SELECT | `supplier_id` | – | `*` |
| 6 | 143 | `GET /api/suppliers/:id` | `price_history` | SELECT | `supplier_id` | `order(recorded_at DESC).limit(50)` | `*` |
| 7 | 150 | `POST /api/suppliers` | `suppliers` | INSERT | – | – | `*` |
| 8 | 158 | `PATCH /api/suppliers/:id` | `suppliers` | SELECT prev | `id` (PK) | – | `*` |
| 9 | 159 | `PATCH /api/suppliers/:id` | `suppliers` | UPDATE | `id` (PK) | – | `*` |
| 10 | 167 | `POST /api/suppliers/:id/products` | `supplier_products` | INSERT | – | – | `*` |
| 11 | 174–177 | `GET /api/suppliers/search/:category` | `supplier_products` + join `suppliers` | SELECT | `category` | – | `*, suppliers(*)` |
| 12 | 196–200 | `POST /api/purchase-requests` | `purchase_requests` | INSERT | – | – | `*` |
| 13 | 206 | `POST /api/purchase-requests` | `purchase_request_items` | INSERT (bulk) | – | – | – |
| 14 | 213–217 | `GET /api/purchase-requests` | `purchase_requests` + `purchase_request_items` | SELECT | – | `order(created_at DESC)` | `*, purchase_request_items(*)` |
| 15 | 230–234 | `POST /api/rfq/send` | `purchase_requests` | SELECT `.single()` | `id` (PK) | – | `*, purchase_request_items(*)` |
| 16 | 239–242 | `POST /api/rfq/send` | `supplier_products` + join `suppliers` | SELECT | `category IN (…)` | – | nested join |
| 17 | 279 | `POST /api/rfq/send` | `rfqs` | INSERT | – | – | `*` |
| 18 | 305 | `POST /api/rfq/send` | `rfq_recipients` | INSERT (per supplier, in loop) | – | – | – |
| 19 | 324 | `POST /api/rfq/send` | `purchase_requests` | UPDATE | `id` (PK) | – | – |
| 20 | 329 | `POST /api/rfq/send` | `system_events` | INSERT | – | – | – |
| 21 | 348 | `GET /api/rfq/:id` | `rfqs` | SELECT `.single()` | `id` (PK) | – | `*` |
| 22 | 349 | `GET /api/rfq/:id` | `rfq_recipients` | SELECT | `rfq_id` | – | `*` |
| 23 | 350 | `GET /api/rfq/:id` | `supplier_quotes` + join | SELECT | `rfq_id` | – | `*, quote_line_items(*)` |
| 24 | 356 | `GET /api/rfqs` | `rfq_summary` (view) | SELECT | – | `order(sent_at DESC)` | `*` |
| 25 | 381 | `POST /api/quotes` | `supplier_quotes` | INSERT | – | – | `*` |
| 26 | 392 | `POST /api/quotes` | `quote_line_items` | INSERT (bulk) | – | – | – |
| 27 | 396–399 | `POST /api/quotes` | `rfq_recipients` | UPDATE | `rfq_id` **+** `supplier_id` | – | – |
| 28 | 403 | `POST /api/quotes` | `price_history` | INSERT (per line item, N+1 in loop) | – | – | – |
| 29 | 438–441 | `POST /api/rfq/:id/decide` | `supplier_quotes` + join | SELECT | `rfq_id` | – | `*, quote_line_items(*)` |
| 30 | 449–452 | `POST /api/rfq/:id/decide` | `suppliers` | SELECT | `id IN (…)` | – | `*` |
| 31 | 524 | `POST /api/rfq/:id/decide` | `purchase_orders` | INSERT | – | – | `*` |
| 32 | 543 | `POST /api/rfq/:id/decide` | `po_line_items` | INSERT (bulk) | – | – | – |
| 33 | 559 | `POST /api/rfq/:id/decide` | `procurement_decisions` | INSERT | – | – | `*` |
| 34 | 573 | `POST /api/rfq/:id/decide` | `rfqs` | UPDATE | `id` (PK) | – | – |
| 35 | 576–580 | `POST /api/rfq/:id/decide` | `suppliers` | UPDATE | `id` (PK) | – | – |
| 36 | 601–604 | `GET /api/purchase-orders` | `purchase_orders` + join | SELECT | – | `order(created_at DESC)` | `*, po_line_items(*)` |
| 37 | 609 | `GET /api/purchase-orders/:id` | `purchase_orders` + join | SELECT `.single()` | `id` (PK) | – | `*, po_line_items(*)` |
| 38 | 615–619 | `POST /api/purchase-orders/:id/approve` | `purchase_orders` | UPDATE | `id` (PK) | – | `*` |
| 39 | 627 | `POST /api/purchase-orders/:id/send` | `purchase_orders` + join | SELECT `.single()` | `id` (PK) | – | `*, po_line_items(*)` |
| 40 | 630 | `POST /api/purchase-orders/:id/send` | `suppliers` | SELECT `.single()` | `id` (PK) | – | `*` |
| 41 | 667–670 | `POST /api/purchase-orders/:id/send` | `purchase_orders` | UPDATE | `id` (PK) | – | – |
| 42 | 687 | `GET /api/subcontractors` | `subcontractors` + join | SELECT | – | `order(quality_rating DESC)` | `*, subcontractor_pricing(*)` |
| 43 | 693 | `POST /api/subcontractors` | `subcontractors` | INSERT | – | – | `*` |
| 44 | 696 | `POST /api/subcontractors` | `subcontractor_pricing` | INSERT (bulk) | – | – | – |
| 45 | 704–706 | `PUT /api/subcontractors/:id/pricing` | `subcontractor_pricing` | UPSERT | `onConflict(subcontractor_id, work_type)` | – | `*` |
| 46 | 720–723 | `POST /api/subcontractors/decide` | `subcontractor_pricing` + join | SELECT | `work_type` | – | `*, subcontractors(*)` |
| 47 | 781 | `POST /api/subcontractors/decide` | `subcontractor_decisions` | INSERT | – | – | – |
| 48 | 806–808 | `GET /api/analytics/savings` | `procurement_decisions` | SELECT | – (full scan) | – | 4 cols |
| 49 | 810–812 | `GET /api/analytics/savings` | `subcontractor_decisions` | SELECT | – (full scan) | – | 4 cols |
| 50 | 826–830 | `GET /api/analytics/spend-by-supplier` | `suppliers` | SELECT | `total_orders > 0` | `order(total_spent DESC)` | 5 cols |
| 51 | 835–837 | `GET /api/analytics/spend-by-category` | `po_line_items` | SELECT | – (full scan) | – | 2 cols |
| 52 | 854 | `GET /api/audit` | `audit_log` | SELECT | – | `order(created_at DESC).limit(N)` | `*` |
| 53 | 888 | `POST /webhook/whatsapp` | `system_events` | INSERT | – | – | – |

**Total:** 53 distinct query sites (33 reads, 20 writes).

---

## 2. Existing indexes in `001-supabase-schema.sql`

| Table | Index name | Column(s) |
|-------|------------|-----------|
| `supplier_products` | `idx_supplier_products_category` | `category` |
| `supplier_products` | `idx_supplier_products_supplier` | `supplier_id` |
| `price_history` | `idx_price_history_supplier` | `supplier_id` |
| `price_history` | `idx_price_history_product` | `product_key` |
| `purchase_request_items` | `idx_pr_items_request` | `request_id` |
| `rfq_recipients` | `idx_rfq_recipients_rfq` | `rfq_id` |
| `rfq_recipients` | `idx_rfq_recipients_supplier` | `supplier_id` |
| `supplier_quotes` | `idx_quotes_rfq` | `rfq_id` |
| `supplier_quotes` | `idx_quotes_supplier` | `supplier_id` |
| `quote_line_items` | `idx_quote_lines_quote` | `quote_id` |
| `purchase_orders` | `idx_po_supplier` | `supplier_id` |
| `purchase_orders` | `idx_po_status` | `status` |
| `purchase_orders` | `idx_po_project` | `project_id` |
| `po_line_items` | `idx_po_lines_po` | `po_id` |
| `subcontractor_pricing` | `idx_sub_pricing_sub` | `subcontractor_id` |
| `subcontractor_pricing` | `idx_sub_pricing_type` | `work_type` |
| `audit_log` | `idx_audit_entity` | `(entity_type, entity_id)` (composite) |
| `audit_log` | `idx_audit_created` | `created_at DESC` |
| `system_events` | `idx_events_type` | `type` |
| `system_events` | `idx_events_severity` | `severity` |
| `notifications` | `idx_notifications_recipient` | `recipient` |
| `notifications` | `idx_notifications_sent` | `sent` |
| — | PK (implicit, every table) | `id` |
| — | FK → no index created (FK constraint only, not index) | – |

**Total:** 22 explicit indexes + implicit PK on `id` for every table.

---

## 3. Cross-check: filters / ORDER BY without supporting index

### 3.1 Severity = HIGH (missing index → sequential scan very likely in production)

| # | Query location | Column(s) | Why it hurts | Schema status |
|---|----------------|-----------|--------------|---------------|
| H1 | `server.js:134` `supplier_dashboard ORDER BY overall_score DESC` | `suppliers.overall_score` | Every listing (`GET /api/suppliers`) will sort full supplier list. As table grows, full table scan + sort. | **No index** on `suppliers(overall_score)` |
| H2 | `server.js:143` `price_history ORDER BY recorded_at DESC LIMIT 50` per supplier | `price_history(supplier_id, recorded_at)` | Index exists on `supplier_id` alone → filter works, but sort-then-limit still has to sort all price_history rows for that supplier. A **composite** `(supplier_id, recorded_at DESC)` turns this into a single index range scan. | Only single-col index |
| H3 | `server.js:217` `purchase_requests ORDER BY created_at DESC` | `purchase_requests(created_at)` | Full listing endpoint — will sort the entire table every call. | **No index** |
| H4 | `server.js:349` `rfq_recipients WHERE rfq_id = ?` — already indexed → OK | `rfq_id` | – | OK |
| H5 | `server.js:396–399` `rfq_recipients WHERE rfq_id = ? AND supplier_id = ?` | `(rfq_id, supplier_id)` | Two separate indexes exist, but a composite would help equality-equality filter after quote arrival. | Two single-col indexes (acceptable, composite is heuristic-nice-to-have) |
| H6 | `server.js:604` `purchase_orders ORDER BY created_at DESC` (+ `po_line_items` join) | `purchase_orders(created_at)` | Full listing sorts entire table every call. | **No index** |
| H7 | `server.js:687` `subcontractors ORDER BY quality_rating DESC` | `subcontractors(quality_rating)` | Full listing sorts entire table every call. | **No index** |
| H8 | `server.js:829–830` `suppliers WHERE total_orders > 0 ORDER BY total_spent DESC` | `suppliers(total_spent)` and/or `(total_orders, total_spent)` | Analytics endpoint — may run often on dashboards. | **No index** |
| H9 | `server.js:854` `audit_log ORDER BY created_at DESC LIMIT N` | `audit_log.created_at` | Already covered by `idx_audit_created` on `created_at DESC`. | **OK** |
| H10 | `server.js:356` `rfq_summary ORDER BY sent_at DESC` | underlying `rfqs.sent_at` | Aggregation view — no filter, no index. | **No index** |
| H11 | FKs with **no covering index**: `rfqs.purchase_request_id`, `purchase_orders.rfq_id`, `procurement_decisions.(rfq_id, purchase_request_id, purchase_order_id, selected_supplier_id)`, `subcontractor_decisions.selected_subcontractor_id`, `notifications.related_entity_*`, `quote_line_items.item_id`, `price_history.product_id` | multiple | No code query hits most of these today, but any future join / ON DELETE CASCADE will scan. FKs in Postgres are NOT auto-indexed. | **No index** on FK columns |

### 3.2 Severity = MEDIUM (okay for current volume, will degrade)

| # | Query location | Column(s) | Observation |
|---|----------------|-----------|-------------|
| M1 | `server.js:723` `subcontractor_pricing WHERE work_type = ?` | `work_type` | Already has `idx_sub_pricing_type`. OK. |
| M2 | `server.js:177` `supplier_products WHERE category = ?` | `category` | Already has `idx_supplier_products_category`. OK. |
| M3 | `server.js:242` `supplier_products WHERE category IN (…)` | `category` | Index usable for IN. OK. |
| M4 | `server.js:837` `po_line_items SELECT category, total_price` | (full table scan) | No WHERE clause → unavoidable scan. Consider pre-aggregated materialized view if the table grows. |

### 3.3 Severity = LOW (JSONB paths)

`audit_log.previous_value`, `audit_log.new_value`, `procurement_decisions.reasoning`, `subcontractor_decisions.reasoning`, `system_events.data` are JSONB.
- **Current code** does NOT perform any `.contains(…)`, `.filter('data->…')`, `@>`, or path queries against JSONB columns — values are only INSERTed and SELECTed wholesale. GIN index is therefore **not required right now**, but:
- The moment someone writes `WHERE data @> '{"rfqId":"…"}'` or `previous_value->>'name' = …`, Postgres will scan full table without a GIN index.
- **Heuristic recommendation:** add GIN indexes pre-emptively on `audit_log.new_value`, `audit_log.previous_value`, `system_events.data` because audit/event queries are the canonical case where JSON filtering appears.

---

## 4. `SELECT *` vs specific columns

**Count of `SELECT '*'`** in read queries: **26 of 33 reads use `*`.**

| Query | Comment |
|-------|---------|
| `suppliers.*` (lines 141, 158) | Fine for single-row `.single()` but pulls every column including large TEXT notes. |
| `supplier_products.*` (142) | Acceptable. |
| `price_history.*` (143) | Only 50 rows via LIMIT. Fine. |
| `supplier_products.* + suppliers(*)` (176) | Joined expand — pulls every supplier column per product row. Many columns are redundant after the Map dedup on line 180. **Fetch only the fields you actually use**: `suppliers(id, name, active)` + matchedProduct. |
| `purchase_requests.* + purchase_request_items(*)` (216, 232) | Listing endpoint — pulls EVERY column of every request and every item. |
| `supplier_products` + nested `suppliers(id, name, phone, whatsapp, email, preferred_channel, active)` (241) | **GOOD** — this one is column-scoped. |
| `rfqs.*` (348), `rfq_recipients.*` (349), `supplier_quotes.* + quote_line_items(*)` (350) | Could be trimmed. |
| `rfq_summary.*` (356) | View = acceptable. |
| `supplier_quotes.* + quote_line_items(*)` (440) | Needed for decision logic — accepted. |
| `suppliers.*` (451) | Decision uses only `rating`, `delivery_reliability`, `total_orders`, `total_spent`, `id`. Could trim. |
| `purchase_orders.* + po_line_items(*)` (603, 609, 627) | Listing pulls everything. |
| `subcontractors.* + subcontractor_pricing(*)` (687) | Listing — OK. |
| `subcontractor_pricing.* + subcontractors(*)` (722) | OK. |
| `audit_log.*` (854) | `previous_value`, `new_value` are JSONB and can be large. For listing UI, return only `entity_type`, `entity_id`, `action`, `actor`, `detail`, `created_at`. |

**Heuristic rule for this repo:** any listing endpoint that expands JSONB or joins two tables should specify columns explicitly. Three are analytics endpoints (805, 825, 834) that already do this — those are the gold standard.

---

## 5. Pagination on listing endpoints

| Endpoint | Has LIMIT / .range? | Risk |
|----------|---------------------|------|
| `GET /api/suppliers` (131) | **NO** | Full table. As supplier count grows → unbounded response. |
| `GET /api/suppliers/:id` priceHistory (143) | **YES** (`limit(50)`) | OK. |
| `GET /api/suppliers/search/:category` (174) | **NO** | Unbounded. |
| `GET /api/purchase-requests` (213) | **NO** | Unbounded + pulls nested items. |
| `GET /api/rfq/:id` (347–350) | Three queries, none paginated | For one RFQ — usually small, acceptable. |
| `GET /api/rfqs` (355) | **NO** | Unbounded. |
| `GET /api/purchase-orders` (600) | **NO** | Unbounded + joins `po_line_items`. |
| `GET /api/subcontractors` (686) | **NO** | Unbounded. |
| `GET /api/analytics/savings` (805) | **NO** — full scan of both `procurement_decisions` and `subcontractor_decisions` | As decision history grows → slow analytics. |
| `GET /api/analytics/spend-by-supplier` (825) | **NO** | Bounded by supplier count — acceptable. |
| `GET /api/analytics/spend-by-category` (834) | **NO** — full scan of `po_line_items` | As PO volume grows → slow aggregation. |
| `GET /api/audit` (852) | **YES** (`limit(req.query.limit || 50)`) | OK. Note: `limit` from `req.query` should be capped (e.g. `Math.min(parsed, 500)`) to prevent abuse. |

**9 of 12 listing endpoints have NO pagination.** This is the single biggest heuristic risk.

---

## 6. JSONB / GIN indexes

| Table | JSONB column | Indexed? | Code path queries? |
|-------|--------------|----------|--------------------|
| `audit_log` | `previous_value`, `new_value` | **No GIN** | Not currently queried, but listed in full SELECTs. |
| `system_events` | `data` | **No GIN** | Not queried. Inserted only. |
| `procurement_decisions` | `reasoning` | **No GIN** | Never queried, only SELECTed and INSERTed. |
| `subcontractor_decisions` | `reasoning` | **No GIN** | Never queried. |

**Conclusion:** Heuristically, the JSONB columns are write-heavy and read-wholesale — there is no active query that *requires* a GIN index. However, `audit_log` and `system_events` are the tables most likely to attract future path queries, so pre-emptive GIN indexes are worth the storage.

---

## 7. Additional performance hotspots found during static pass

1. **N+1 in `POST /api/quotes` line 402–410**
   A loop inserts into `price_history` **one row per line item**. Replace with a single `insert([...])` bulk call. Same pattern on line 305 (`rfq_recipients` insert per supplier inside a `for (...)` loop).
2. **`POST /api/rfq/send` line 305** — inserts `rfq_recipients` **inside a `for (const supplier of suppliers)` loop**, sequentially awaiting each. This is N round-trips to Supabase when 1 bulk insert would do. The `await sendWhatsApp` must stay per-supplier, but DB row creation can be collected then inserted once.
3. **Double fetch in `PATCH /api/suppliers/:id` lines 158–159** — fetches `prev` then updates; can be combined by using `.select()` after the update and reading audit after the fact, OR by `returning=representation` with `prefer=representation` to get old vs new in one round-trip (Supabase doesn't natively return both but you can use `.rpc()`).
4. **`supplier_dashboard` and `rfq_summary` views** — both use `GROUP BY` + `LEFT JOIN` + `FILTER`. Views without materialization are rebuilt on every call. For dashboards hit on every page-load, consider `MATERIALIZED VIEW ... REFRESH` or a TTL cache.
5. **`GET /api/status` line 112** calls `procurement_dashboard` which contains **9 separate subqueries** — this is executed on every status ping. Acceptable for low-rate health checks, but **do not poll it at high frequency from the frontend**. No index fixes this; it's a view-shape issue.
6. **No index on `suppliers.active`** — filtered in JS (line 182, 246) **after** fetching. Acceptable, but for a future `WHERE active = true` at DB level, add a partial index.
7. **FK columns without indexes** → slow `ON DELETE CASCADE`. Example: `supplier_products → suppliers` CASCADE (indexed — OK); `quote_line_items → supplier_quotes` CASCADE (indexed — OK); `purchase_request_items → purchase_requests` CASCADE (indexed — OK); `rfq_recipients → rfqs` CASCADE (indexed — OK); `po_line_items → purchase_orders` CASCADE (indexed — OK); `subcontractor_pricing → subcontractors` CASCADE (indexed — OK). **Good — all CASCADE FKs are already covered.** But non-CASCADE FKs like `rfqs.purchase_request_id`, `purchase_orders.rfq_id`, `procurement_decisions.*` are not indexed and will be needed when joins are added.
8. **Loop-driven `await supabase.from(...).insert(...)`** pattern appears in `price_history` insertion (line 403) — classic N+1.
9. **`PUT /api/subcontractors/:id/pricing`** uses `.upsert({...}, { onConflict: 'subcontractor_id,work_type' })` — the schema HAS `UNIQUE(subcontractor_id, work_type)` which implicitly creates a composite index. OK.

---

## 8. Recommended index list (ordered by priority)

```sql
-- ════════════════════════════════════════════════════════════════════
-- HIGH PRIORITY — fixes active bottlenecks in current code paths
-- ════════════════════════════════════════════════════════════════════

-- H1: GET /api/suppliers ordering
CREATE INDEX IF NOT EXISTS idx_suppliers_overall_score
  ON suppliers(overall_score DESC);

-- H2: /api/suppliers/:id — price history timeline per supplier
CREATE INDEX IF NOT EXISTS idx_price_history_supplier_recorded
  ON price_history(supplier_id, recorded_at DESC);

-- H3: GET /api/purchase-requests listing
CREATE INDEX IF NOT EXISTS idx_purchase_requests_created
  ON purchase_requests(created_at DESC);

-- H6: GET /api/purchase-orders listing
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created
  ON purchase_orders(created_at DESC);

-- H7: GET /api/subcontractors listing
CREATE INDEX IF NOT EXISTS idx_subcontractors_quality
  ON subcontractors(quality_rating DESC);

-- H8: /api/analytics/spend-by-supplier
CREATE INDEX IF NOT EXISTS idx_suppliers_total_spent
  ON suppliers(total_spent DESC) WHERE total_orders > 0;

-- H10: GET /api/rfqs — underlying table
CREATE INDEX IF NOT EXISTS idx_rfqs_sent_at
  ON rfqs(sent_at DESC);

-- H5: update WHERE (rfq_id, supplier_id) in POST /api/quotes
CREATE INDEX IF NOT EXISTS idx_rfq_recipients_rfq_supplier
  ON rfq_recipients(rfq_id, supplier_id);

-- ════════════════════════════════════════════════════════════════════
-- MEDIUM PRIORITY — FK columns with no current query but needed for joins/CASCADE
-- ════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_rfqs_purchase_request
  ON rfqs(purchase_request_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_rfq
  ON purchase_orders(rfq_id);

CREATE INDEX IF NOT EXISTS idx_procurement_decisions_rfq
  ON procurement_decisions(rfq_id);

CREATE INDEX IF NOT EXISTS idx_procurement_decisions_po
  ON procurement_decisions(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_procurement_decisions_supplier
  ON procurement_decisions(selected_supplier_id);

CREATE INDEX IF NOT EXISTS idx_procurement_decisions_decided_at
  ON procurement_decisions(decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_subcontractor_decisions_sub
  ON subcontractor_decisions(selected_subcontractor_id);

CREATE INDEX IF NOT EXISTS idx_subcontractor_decisions_decided_at
  ON subcontractor_decisions(decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_related_entity
  ON notifications(related_entity_type, related_entity_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON suppliers(active) WHERE active = true;

-- ════════════════════════════════════════════════════════════════════
-- LOW PRIORITY — JSONB GIN (pre-emptive — no current query needs it)
-- ════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_audit_new_value_gin
  ON audit_log USING GIN (new_value jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_audit_previous_value_gin
  ON audit_log USING GIN (previous_value jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_system_events_data_gin
  ON system_events USING GIN (data jsonb_path_ops);
```

**19 new indexes total** — 8 HIGH, 8 MEDIUM (FK), 3 LOW (JSONB GIN).

---

## 9. Non-index recommendations (code-level)

1. **Add `.range(from, to)` pagination** to all 9 unpaginated listing endpoints:
   - `GET /api/suppliers`, `GET /api/suppliers/search/:category`, `GET /api/purchase-requests`, `GET /api/rfqs`, `GET /api/purchase-orders`, `GET /api/subcontractors`, `GET /api/analytics/savings` (batched), `GET /api/analytics/spend-by-category`.
   - Read `page` and `pageSize` from `req.query`, clamp to max 200.
2. **Cap `GET /api/audit` `limit` param** at `Math.min(parseInt(req.query.limit) || 50, 500)` — today an attacker can pass `?limit=9999999`.
3. **Bulk INSERT in POST /api/quotes** — replace `for (item of lineItems) { await supabase.from('price_history').insert(...) }` with `await supabase.from('price_history').insert(lineItems.map(...))`.
4. **Bulk INSERT in POST /api/rfq/send** — accumulate the `rfq_recipients` rows during the supplier loop and run **one** `insert([...])` after the loop.
5. **Trim SELECT *** on:
   - `GET /api/suppliers/search/:category` (line 176) — use `suppliers(id, name, phone, whatsapp, email, active, overall_score)`.
   - `GET /api/audit` — return only display fields, omit the JSONB `previous_value` / `new_value` in list mode; provide a separate detail endpoint.
   - `POST /api/rfq/:id/decide` (line 451) — decision needs only `id, rating, delivery_reliability, total_orders, total_spent`.
6. **Materialize the two heavyweight views** (`supplier_dashboard`, `procurement_dashboard`) if they are polled from the frontend; schedule `REFRESH MATERIALIZED VIEW CONCURRENTLY` every minute.
7. **`GET /api/analytics/spend-by-category`** currently fetches every `po_line_items` row and aggregates in JS. Move the aggregation to SQL: `supabase.rpc('spend_by_category')` or a view `SELECT category, SUM(total_price) ... GROUP BY category`.
8. **`GET /api/analytics/savings`** fetches both decision tables in full every call. Same treatment — either move to a view that returns the two totals or restrict by a date window (`.gte('decided_at', sinceDate)`).

---

## 10. Summary score (heuristic)

| Area | Score | Notes |
|------|-------|-------|
| Index coverage on current WHERE filters | 7 / 10 | Most `.eq(id)` and FK lookups covered. Missing: sort columns. |
| Index coverage on ORDER BY | 2 / 10 | 6 listing endpoints sort by unindexed columns. |
| Pagination discipline | 2 / 10 | 9 of 12 listings unbounded. |
| SELECT column scoping | 4 / 10 | 26 of 33 reads use `*`. |
| N+1 / bulk-insert discipline | 6 / 10 | Two clear N+1 loops (`price_history`, `rfq_recipients`). |
| JSONB indexing (current needs) | 10 / 10 | No active path queries → no actual bottleneck. |
| JSONB indexing (future-proof) | 5 / 10 | No GIN pre-emptively. |
| FK coverage (non-CASCADE) | 4 / 10 | Several unindexed FKs on decision tables. |
| **Overall heuristic DB-perf grade** | **C+ / 68** | Fine for dev / small data. Will degrade linearly with row count. |

---

*End of QA Agent #71 report.*
