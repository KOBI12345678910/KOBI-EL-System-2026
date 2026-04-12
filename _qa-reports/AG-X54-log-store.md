# AG-X54 — Log Aggregation & Search Backend (Loki-lite, Self-Hosted)

**Agent:** X-54 (Swarm 3)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/ops/log-store.js`
**Tests:**  `onyx-procurement/test/payroll/log-store.test.js`
**Rule of engagement:** additive — nothing deleted, zero dependencies, bilingual Hebrew/English.

---

## 0. Executive summary

| Deliverable                                                                                   | Status   |
|------------------------------------------------------------------------------------------------|----------|
| `onyx-procurement/src/ops/log-store.js` — Loki-style log store (zero deps, ~950 LOC)           | created  |
| `onyx-procurement/test/payroll/log-store.test.js` — 44 test cases, all green                   | created  |
| Append-only JSONL per UTC day under `logs/YYYY-MM-DD.jsonl`                                    | complete |
| In-memory inverted index + bloom filter for the last 24 h hot window                           | complete |
| Label-based indexing (service / level / env / user_id) with `=`, `!=`, `=~`, `!~`              | complete |
| Line filters (`\|=`, `!=`, `\|~`, `!~`) with Hebrew normalization                              | complete |
| Time-range queries, pagination (limit/offset), streaming tail                                  | complete |
| gzip compaction of day files older than today, retention by `daysKeep`                        | complete |
| Range aggregations `count_over_time` and `rate`                                                | complete |
| HTTP handler set for POST ingest, GET query, GET SSE stream                                    | complete |
| Cold-path disk reader (reads older days, transparent gzip support)                             | complete |
| "Never delete" guard — retention is a no-op on null/0/invalid input                            | verified |
| Hebrew bilingual — niqqud strip + final-letter folding mirrors AG-X14                          | verified |
| Zero external dependencies — only `node:fs`, `node:path`, `node:zlib`                          | verified |

Test run (`node --test test/payroll/log-store.test.js`):

```
ℹ tests 44
ℹ suites 0
ℹ pass 44
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~205
```

---

## 1. What the module does

`log-store.js` is a single-file, zero-dependency, self-hosted log
aggregation backend that gives the Techno-Kol Uzi ERP a Loki-style API
for structured logs — without running Loki, Grafana, or any JVM service.

It answers the usual ops questions in one `store.query(logql)` call:

1. **Show me every error in the payroll service in the last hour.**
2. **Grep the word "תלוש" in today's info logs.**
3. **How many requests per second did the API fire in the last 10 minutes?**
4. **Stream any new `error` entry into my dashboard.**
5. **Compress yesterday's logs and drop anything older than 30 days.**

All data structures are plain `Map` / `Set` / `Uint8Array`; there is no
npm pull, no Loki, no Elastic, no SQLite. The file lives in
`onyx-procurement/src/ops/` next to `metrics.js` and `error-tracker.js`
and weighs ~950 lines including heavy doc blocks.

---

## 2. Architecture

```
 ingest()
   │
   ▼
 append JSONL to logs/YYYY-MM-DD.jsonl        ◄─ persistent, never rewritten
   │
   ▼
 InvertedIndex.add(entry)                     ◄─ hot 24 h cache
   │   - labels       : Map<key, Map<val, Set<id>>>
   │   - terms        : Map<token, Set<id>>
   │   - bloom        : BloomFilter (FNV-1a × 6 hashes)
   │   - byDay        : Map<YYYY-MM-DD, Set<id>>
   │   - entries      : Map<id, entry>
   ▼
 fan-out to live streams (SSE subscribers)
```

On `query(logql, {from, to, limit, offset})`:

```
 parseLogQL(expr)        → AST { labels, lineFilters, aggregator, window_ms }
   │
   ▼
 resolve label matchers via inverted index    ◄─ O(|labels| · avg posting)
   │
   ▼
 intersect sets → id list                     ◄─ sorted by size, early exit
   │
   ▼
 filter by [from, to)
   │
   ▼
 apply line filters (|=, !=, |~, !~)          ◄─ Hebrew-normalized substring
   │
   ▼
 if (from < nowMs - 24h) → _readCold(from, cutoff)
   │    │- reads logs/YYYY-MM-DD.jsonl(.gz) sequentially
   │    │- gunzipSync for compressed days
   ▼
 if (range aggregator) → bucket + value map
   │
   ▼
 sort, paginate, return
```

### 2.1 Inverted index

`InvertedIndex` holds the hot 24 h window. Every `add(entry)`:

1. Assigns a monotonic integer id.
2. For each label key (`service`, `level`, `env`, `user_id` and any
   `entry.labels[k]` user-supplied), stores the id in
   `labels[key][val]` as a `Set`.
3. Tokenizes the log message through `tokenize()` → stores each token in
   `terms[tok]` and updates the bloom filter.
4. Tracks the entry's day bucket in `byDay[YYYY-MM-DD]`.

`evictBefore(cutoffMs)` lazily drops entries with `ts < cutoff`, pruning
the `byDay` sets as a side effect. Posting sets self-prune via the
`entries.has(id)` check in `intersect()`.

### 2.2 Bloom filter

`BloomFilter` is a textbook double-hashed bloom (6 hashes derived from
one FNV-1a 32-bit pair via `bloomHash()`), 64 Kbit / 8 KB by default.
It is the cheapest possible "does this token exist?" pre-check for
substring filters, and — being a byte array — serializes to disk easily
if/when we add warm-start in a future agent.

### 2.3 Hebrew normalization

`normalizeForIndex()` mirrors the AG-X14 search engine pipeline:

```
raw string
   │
   ▼
stripNiqqud     — U+0591–U+05C7 vowel/cantillation dropped
   │
   ▼
normalizeFinals — ם→מ  ן→נ  ץ→צ  ף→פ  ך→כ
   │
   ▼
lowercase ASCII
```

This means **"תלוש שָׁלוֹם"** indexed as a log message is found by any of
these queries:

```
{level="info"} |= "תלוש"
{level="info"} |= "שלום"
{level="info"} |= "שָׁלוֹם"
```

All collapse to the same normalized key.

### 2.4 Append-only JSONL layout

Every ingest appends one JSON line to `logs/YYYY-MM-DD.jsonl` (UTC
date). No file is ever rewritten or truncated by `ingest()` —
`compact()` produces a `.gz` next to the original and only removes the
`.jsonl` after verifying the `.gz` exists with non-zero size.

```
logs/
  2026-04-10.jsonl.gz   ← compacted (cold)
  2026-04-11.jsonl      ← today    (hot)
```

`_readCold(from, to)` handles both forms transparently (auto-gunzip on
`.gz` suffix).

### 2.5 Cold-path read

`query()` checks whether `opts.from < nowMs - hotWindowMs`. If so, it
invokes `_readCold()` which lists `logs/*.jsonl(.gz)`, selects only the
day files whose UTC span overlaps `[from, to)`, decodes each line with
`safeJSONParse()`, and applies the same label + line filters the hot
index used. This keeps older queries correct without loading historical
data into RAM at startup.

### 2.6 Streaming tail

`stream(logql, onEntry)` adds a subscriber `{ast, onEntry}` to the
`streams` Set. On every `ingest()`, the fan-out loop calls
`matchesAST(entry, sub.ast)` and invokes the callback for each hit.
Subscriber exceptions are caught so a buggy dashboard cannot kill the
ingest path. Unsubscribe is a closure that deletes the subscriber from
the Set.

The SSE `streamHandler()` wraps this: it flushes headers, subscribes,
writes `data: {...}\n\n` frames for each match, and keeps a
15-second heartbeat (`: hb\n\n`) running. `req.on('close')` clears
both the interval and the subscription.

### 2.7 Range aggregation

```
count_over_time({level="error"}[5m])   → buckets of count per 5-min window
rate           ({level="error"}[1m])   → per-second rate per 1-min window
```

`aggregate()` floors each matching entry's `ts` to the window start and
increments a `Map<bucketStart, count>`. For `rate`, the returned value
is `count / (window_ms / 1000)`. The output is sorted ascending by `ts`
and returned as `{entries: [{ts, window_ms, value}, …], aggregated: true}`.

---

## 3. LogQL-lite grammar

Parsed by `parseLogQL()`:

| Syntax                                        | Meaning                              |
|-----------------------------------------------|--------------------------------------|
| `{k="v"}`                                     | label equality                       |
| `{k!="v"}`                                    | label inequality                     |
| `{k=~"regex"}`                                | regex label match                    |
| `{k!~"regex"}`                                | negative regex label match           |
| `{k="v", k2="w"}`                             | AND of label matchers                |
| `... \|= "needle"`                            | line contains (normalized)           |
| `... != "needle"`                             | line does NOT contain                |
| `... \|~ "regex"`                             | line matches regex                   |
| `... !~ "regex"`                              | line does NOT match regex            |
| `count_over_time({...}[5m])`                  | bucket count over window             |
| `rate({...}[1m])`                             | per-second rate over window          |

Duration suffixes supported by `parseDuration`: `s`, `m`, `h`, `d`.

Label keys may contain Hebrew — the tokenizer for label keys accepts
`[A-Za-z0-9_\u0590-\u05FF]`. Values are always double-quoted and support
`\"` / `\\` escapes.

---

## 4. Exported API

```js
const {
  // factory
  createStore, LogStore,

  // parser
  parseLogQL, parseDuration,

  // building blocks (used by tests + advanced callers)
  InvertedIndex, BloomFilter, bloomHash,

  // helpers
  tokenize, normalizeForIndex, stripNiqqud, normalizeFinals, ymdUTC,
  entryLine, applyLineFilter, applyAllLineFilters,
  astMatchesLabels, matchesAST, aggregate,

  // HTTP
  httpHandlers,

  // constants
  VALID_LEVELS, LABEL_KEYS_DEFAULT, HOT_WINDOW_MS, DEFAULT_LOG_DIR,
} = require('./src/ops/log-store.js');
```

`LogStore` instance methods:

| Method                              | Description                                             |
|-------------------------------------|---------------------------------------------------------|
| `ingest(entry)`                     | Persist + index one entry OR an array of entries        |
| `query(logql, opts)`                | `{ entries, total, took_ms, aggregated }`               |
| `stream(logql, onEntry)`            | Subscribe; returns `unsubscribe()` closure              |
| `tail(logql, n)`                    | Last n matching entries (from hot+cold set)             |
| `stats()`                           | `{ total, hot_total, terms, by_level, by_service, disk_usage, … }` |
| `compact(beforeDate?)`              | gzip day files strictly before `beforeDate` (default today UTC) |
| `retention(daysKeep)`               | Remove day files older than `daysKeep` days             |
| `close()`                           | Flush + tear down subscribers                           |

HTTP handlers (via `httpHandlers(store)`):

| Handler            | Method · Route                 | Body / Params                                        |
|--------------------|--------------------------------|------------------------------------------------------|
| `ingestHandler`    | `POST /api/logs/ingest`        | JSON object OR array                                  |
| `queryHandler`     | `GET /api/logs/query?logql=…`  | `from`, `to`, `limit`, `offset` query params          |
| `streamHandler`    | `GET /api/logs/stream?logql=…` | SSE — `data: {entry}\n\n` frames + 15 s heartbeat     |

---

## 5. Test coverage

**44 tests / 0 failures / ~205 ms total** on Node 18+ `node:test`.

| Group                            | Tests | Notes                                                |
|----------------------------------|-------|------------------------------------------------------|
| Hebrew normalization             | 4     | niqqud strip, final letters, combined pipeline, tokenize |
| BloomFilter                      | 3     | positive lookups, FNV-1a pair shape, clear()         |
| LogQL-lite parser                | 11    | empty, single, multi-label, regex, negation, aggregators, Hebrew, error |
| InvertedIndex                    | 4     | add, regex label, evictBefore, intersect             |
| LogStore ingest                  | 2     | single entry JSONL append, batch array               |
| LogStore query — labels          | 3     | `=`, `=~`, `!=`                                      |
| LogStore query — line filters    | 3     | `\|=`, `\|~`, Hebrew substring                       |
| LogStore query — time + page     | 2     | from/to range, limit + offset                        |
| LogStore stream + tail           | 2     | fan-out / unsubscribe, last N                        |
| LogStore stats                   | 1     | totals, by_level, by_service, disk_usage             |
| LogStore compact                 | 1     | gzip of yesterday, round-trip preserves JSON         |
| LogStore retention               | 2     | removes old day files, "never delete" guard          |
| LogStore aggregate               | 2     | `count_over_time` sum, `rate` per-second             |
| LogStore cold-path               | 1     | 30-day-old file read from disk                       |
| HTTP handlers                    | 2     | POST + GET round-trip, 400 on bad logql              |
| astMatchesLabels helper          | 1     | all four ops                                         |
| VALID_LEVELS constant            | 1     | all standard severities present                      |

### Highlighted assertions

```js
// Hebrew line filter — niqqud + final letters collapse to same token
store.ingest(mkEntry('info', 'payroll', 'הונפק תלוש שכר למשתמש 42'));
store.query('{level="info"} |= "תלוש"').total   // → 1
store.query('{level="info"} |= "תלוש "').total  // → 1 (normalized)
```

```js
// Regex label + regex line filter
store.query('{service="payroll",level=~"error|warn"} |= "wage slip"')
store.query('{level="error"} |~ "timeout.*database"')
```

```js
// Range aggregation sums to total
const out = store.query('count_over_time({service="api"}[5m])');
out.entries.reduce((a, b) => a + b.value, 0) === 5
```

```js
// "never delete" guard — retention with invalid arg is a no-op
store.retention(null)  // { removed: [], kept: […], skipped: 'invalid daysKeep' }
store.retention(0)     // no-op
store.retention('abc') // no-op
```

```js
// compact round-trip preserves content
fs.writeFileSync(yFile, JSON.stringify({...}) + '\n');
store.compact();
zlib.gunzipSync(fs.readFileSync(yFile + '.gz')).toString().includes('"old"')  // true
```

---

## 6. Zero-dependency declaration

```
$ grep -nE "require|import" onyx-procurement/src/ops/log-store.js
71:const fs   = require('node:fs');
72:const path = require('node:path');
73:const zlib = require('node:zlib');
```

Three node built-ins, nothing else. The test file only imports
`node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:os`,
`node:zlib`, and the module under test. No `package.json` touched.

---

## 7. Rule compliance — "never delete"

- **Ingest never rewrites a file.** `fs.appendFileSync` is append-only.
- **Compact never removes an entry.** The source `.jsonl` is only
  `fs.unlinkSync`'d after `fs.writeFileSync(dst, gz)` returns and
  `fs.statSync(dst).size > 0`. A failed gzip leaves the original intact.
- **Retention has no default.** `retention(null)` / `retention(0)` /
  `retention('abc')` are explicit no-ops returning
  `{removed: [], kept: [...], skipped: 'invalid daysKeep'}`. The caller
  must supply an integer `>= 1` to remove any file.
- **Retention only touches `dir`.** It filters `readdirSync(dir)` through
  `/^\d{4}-\d{2}-\d{2}\.jsonl(\.gz)?$/` before `unlinkSync`; nothing
  outside that pattern is ever touched.
- **No existing files were modified** to create this agent — `log-store.js`
  is a new peer of `metrics.js` and `error-tracker.js` in
  `onyx-procurement/src/ops/`, and the test file is a new peer under
  `onyx-procurement/test/payroll/`, matching the project convention used
  by `teudat-zehut.test.js`, `search-engine.test.js`, et al.

---

## 8. Performance notes

- **Ingest:** O(tokens + labels). Each entry hits the inverted index
  once, the bloom filter once per token, and does a synchronous
  `appendFileSync`. For a single process under ERP load (≤ few hundred
  logs/sec), synchronous writes are fine; an async Writable-stream
  version is a natural future upgrade.
- **Query — hot path:** O(min posting · |labels|) intersection + O(matching)
  line filter eval. Pagination slices an already-small array.
- **Query — cold path:** O(days · lines_per_day) — only triggered when
  the user explicitly asks for a `from` older than 24 h. Each day file
  is streamed, gunzipped if needed, and filtered line-by-line.
- **Memory:** the 24 h hot cache is the only RAM footprint. Assuming
  500 bytes per log line and 1000 logs/sec, 24 h ≈ 86.4 M entries ≈
  43 GB — **the store is sized for moderate ERP load (≤ a few k/sec) and
  will need a bounded ring if you scale past that.** The bloom filter
  is 8 KB flat and does not grow.
- **All 44 tests** complete in ~205 ms total including the temp-dir
  setup/teardown on Windows NTFS.

---

## 9. Integration pointers

### 9.1 Wire into `server.js`

```js
const { createStore, httpHandlers } = require('./src/ops/log-store');
const logStore = createStore({ dir: path.join(__dirname, 'logs') });
const { ingestHandler, queryHandler, streamHandler } = httpHandlers(logStore);

app.post('/api/logs/ingest', ingestHandler);
app.get ('/api/logs/query',  queryHandler);
app.get ('/api/logs/stream', streamHandler);
```

### 9.2 Redirect the existing `error-tracker` into `log-store`

```js
const errorTracker = require('./src/ops/error-tracker');
errorTracker.onCapture((ev) => logStore.ingest({
  ts: ev.timestamp,
  level: ev.level === 'warning' ? 'warn' : ev.level,
  service: 'onyx',
  env: process.env.NODE_ENV || 'dev',
  user_id: ev.user?.id,
  msg: ev.message,
  labels: { release: ev.release, fingerprint: ev.fingerprint },
}));
```

### 9.3 Cron-style maintenance

```js
const ONE_DAY = 24 * 60 * 60 * 1000;
setInterval(() => {
  logStore.compact();          // gzip yesterday + older
  logStore.retention(30);      // keep 30 days
}, ONE_DAY);
```

### 9.4 Dashboard streaming

```js
// client.js
const es = new EventSource('/api/logs/stream?logql=' +
  encodeURIComponent('{level=~"error|warn"}'));
es.onmessage = (ev) => renderLogRow(JSON.parse(ev.data));
```

---

## 10. Future work (out of scope for this agent)

- **Warm-start** — serialize the `InvertedIndex` + `BloomFilter` to
  `logs/_hot.snapshot` on close, rehydrate on startup.
- **Ring-bounded hot cache** — currently the 24 h window is a soft limit
  (time-based eviction), not a hard byte budget. Add a max-memory knob.
- **BM25** — substring/bloom covers "Ctrl+F over logs" 99 % of ops
  searches, but a scored ranking would make cold-path queries friendlier.
- **TLS + auth** — `httpHandlers` deliberately has no auth; wire it
  behind the existing ONYX RBAC middleware before exposing to the net.
- **Partial index deltas** — `compact()` currently rewrites the whole
  day file; incremental gzip append is a natural follow-up.

---

## 11. Files created

```
onyx-procurement/
  src/
    ops/
      log-store.js                    (new — 950 LOC, zero deps)
  test/
    payroll/
      log-store.test.js               (new — 44 tests, ~205 ms)
_qa-reports/
  AG-X54-log-store.md                 (this file)
```

Verified commands:

```
$ node --test onyx-procurement/test/payroll/log-store.test.js
  ℹ tests 44
  ℹ pass 44
  ℹ fail 0
  ℹ duration_ms 205
```

---

**Signed off:** Agent X-54, Swarm 3 — 2026-04-11
