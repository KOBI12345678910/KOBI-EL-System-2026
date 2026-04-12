# ONYX DB — Query Performance Analyzer

Agent-57 observability module.

Wraps the supabase client so every query is timed, counted, and (if slow)
logged.  Purely additive: the primary supabase client in `server.js` stays
untouched, and any caller that prefers the raw client continues to work.

## What gets measured

For every awaited query:

| Field          | Source                                               |
|----------------|------------------------------------------------------|
| `table`        | the first argument to `.from(table)`                 |
| `op`           | `select` / `insert` / `update` / `delete` / `upsert` |
| `rows`         | `data.length` (array) or `1` (object) or `count`     |
| `duration_ms`  | wall clock between `await` entry and fulfilment      |
| `error`        | normalized from `result.error` or a thrown error     |

## Slow queries

Any sample whose `duration_ms` exceeds the threshold is:

1. Appended to `logs/slow-queries.jsonl` (one JSON object per line).
2. Pushed onto the in-memory `top_slowest` heap (capped at 10).

Threshold defaults to **500 ms** and is overridable via env:

```
ONYX_SLOW_QUERY_MS=500        # threshold in ms
ONYX_QA_LOG_DIR=./logs        # where slow-queries.jsonl is written
ONYX_QA_MAX_SAMPLES=10000     # per-table reservoir cap for p50/p95/p99
```

## Wiring

### Option A — wrap the existing client

```js
// server.js
const { createClient } = require('@supabase/supabase-js');
const { wrapSupabase, registerAdminRoutes } = require('./src/db/query-analyzer');

const rawSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabase = wrapSupabase(rawSupabase);   // swap in the wrapped client

registerAdminRoutes(app);                      // GET/POST admin endpoints
```

### Option B — instrument specific calls only

```js
const { measure } = require('./src/db/query-analyzer');

const result = await measure(
  { table: 'suppliers', op: 'select' },
  supabase.from('suppliers').select('*').eq('active', true)
);
```

Use `measure()` if you only want to track a handful of hot queries instead of
every query the server makes.

## Endpoints

| Method | Path                                | Purpose                          |
|--------|-------------------------------------|----------------------------------|
| GET    | `/api/admin/query-stats`            | JSON dashboard (stats below)     |
| POST   | `/api/admin/query-stats/reset`      | Zero the in-memory counters      |

Response shape for `GET /api/admin/query-stats`:

```json
{
  "config": { "slow_threshold_ms": 500, "max_samples_per_table": 10000 },
  "uptime_ms": 123456,
  "totals":    { "queries": 420, "errors": 2, "tables_seen": 9 },
  "qpm":       { "current_minute": 7, "last_5_minutes_total": 40,
                 "last_5_minutes_avg": 8, "timeline": [...] },
  "top_slowest": [ { "table": "rfqs", "op": "select",
                     "duration_ms": 1240, "rows": 12, "error": null,
                     "at": "2026-04-11T12:34:56.000Z" }, ... ],
  "top_frequent_tables": [ { "table": "suppliers", "count": 120,
                             "errors": 0, "avg_ms": 18.5 }, ... ],
  "per_table": [
    { "table": "suppliers", "count": 120, "errors": 0, "total_rows": 840,
      "avg_ms": 18.5, "p50_ms": 14, "p95_ms": 68, "p99_ms": 120,
      "max_ms": 320, "ops": { "select": 110, "insert": 8, ... } }
  ]
}
```

## Tests

```
node --test src/db/query-analyzer.test.js
```

The test file ships a minimal mock supabase client (fluent `from().select()`
chain with configurable delay and error) and covers:

- counters + totals arithmetic
- percentile math on a uniform distribution
- slow query file emission
- top-N sorting (slowest + most frequent)
- wrapSupabase on select/insert/error/delay
- `/api/admin/query-stats` and `/reset` handlers

## Notes

- Reservoir sampling keeps p50/p95/p99 accurate even after tens of millions
  of queries without leaking memory.
- The wrapper never swallows errors — it only records them and re-throws.
- The slow-query log is append-only; rotate it externally (logrotate, etc.).
- `reset()` does not clear the on-disk slow-query log, only the RAM state.
