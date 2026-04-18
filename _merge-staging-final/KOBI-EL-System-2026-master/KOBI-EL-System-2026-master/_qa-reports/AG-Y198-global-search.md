# AG-Y198 — Global Search Federator / פדרטור חיפוש גלובלי

**Agent:** Y-198
**System:** Techno-Kol Uzi Mega-ERP
**Date:** 2026-04-11
**Status:** PASS (25/25 tests green)

---

## 1. Summary / תקציר

**EN** — Implemented a zero-dependency federated search layer that scatters a
user query across every registered ERP module index (procurement, HR, finance,
CRM, inventory, etc.), gathers partial results with per-module timeout
tolerance, re-ranks them with a unified BM25 + TF-IDF model, applies ACL
filtering, and emits safe highlighted HTML plus type/owner/date facets.

**HE** — יושם מנוע חיפוש פדרטיבי ללא תלויות חיצוניות, המפזר שאילתת משתמש
בכל אינדקס מודול רשום ב-ERP (רכש, משאבי אנוש, פיננסים, CRM, מלאי ועוד),
אוסף תוצאות חלקיות עם סבילות ל-timeout לכל מודול, מדרג אותן מחדש באמצעות
מודל מאוחד BM25 + TF-IDF, מסנן לפי הרשאות, ומחזיר HTML בטוח עם הדגשות
ופאסטות לפי סוג/בעלים/תאריך.

---

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-procurement/src/wiring/global-search.js` | GlobalSearch class + helpers |
| `onyx-procurement/test/wiring/global-search.test.js` | 25 tests (`node --test`) |
| `_qa-reports/AG-Y198-global-search.md` | This bilingual QA report |

---

## 3. Architecture / ארכיטקטורה

```
                        ┌───────────────────┐
 query(q, opts) ───────▶│   GlobalSearch    │
                        │  (federator)      │
                        └─────┬─────────────┘
                              │ scatter (parallel, per-module timeout)
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    procurement          hr.searchFn         finance.searchFn
    .searchFn                                      ...
          │                   │                   │
          └────────┬──────────┴───────────────────┘
                   ▼ gather (allSettled + timeout sentinels)
           ┌───────────────────────┐
           │ unified BM25 + TF-IDF │
           │ ACL filter            │
           │ type/module filter    │
           │ facets                │
           │ safe HTML highlight   │
           └──────┬────────────────┘
                  ▼
         SearchResponse (results, facets, diagnostics, tookMs)
```

---

## 4. API Surface / ממשק

```js
const { GlobalSearch } = require('./global-search');

const gs = new GlobalSearch({
  defaultTimeoutMs: 250,   // per-module scatter timeout
  defaultLimit:     50,    // max results returned
  snippetLen:       240,   // chars for highlighted snippet
});

gs.registerIndex('procurement', async (q, { limit, types, perms, signal }) => [...]);
gs.registerIndex('hr',          async (q, opts) => [...]);
gs.registerIndex('finance',     async (q, opts) => [...]);

// Federated query
const res = await gs.query('concrete בטון', {
  limit:   20,
  types:   ['po', 'invoice'],
  perms:   ['ops', 'finance'],
  modules: ['procurement', 'finance'],   // optional whitelist
  timeoutMs: 300,
});

// res ⇒ {
//   query, queryTokens, results, total, totalFetched,
//   facets: { type, owner, date },
//   diagnostics: { responded, timedOut, errored },
//   tookMs
// }
```

### Lifecycle / מחזור חיים

| Method | Behavior |
|---|---|
| `registerIndex(id, fn)` | Adds or replaces the module's searchFn. Never deletes. |
| `unregisterIndex(id)` | **Soft-disable only** — entry remains in the registry, `enabled=false`. |
| `enableIndex(id)` | Re-enables a previously disabled module. |
| `modules` | Readonly array of all registered ids (enabled or not). |
| `enabledModules` | Readonly array of currently enabled ids. |

**Never-Delete rule** — the underlying `Map` is append-only; `unregisterIndex`
flips a flag but retains the entry so audit trails stay intact.
**כלל אי-מחיקה** — ה-Map הוא append-only; `unregisterIndex` מפיל דגל אבל
שומר על הרישום לצורכי audit.

---

## 5. Tokenizer / מתקן מילים

Bilingual, handles:
- **Hebrew** — strips niqqud (U+0591..U+05C7), normalizes 5 final letters
  (ם ן ץ ף ך → מ נ צ פ כ), Hebrew-block letters only (U+05D0..U+05EA).
- **English** — lowercase, ASCII letters + digits.
- **Stopwords** — short bilingual list (the, of, is, as… / של, את, על, עם…).
- **Mixed input** — `"Cement בטון 500kg"` → `["cement", "בטונ", "500kg"]`.

Test cases 1–4 cover tokenizer invariants.

---

## 6. Scoring / דירוג

Unified re-ranker combines three signals:

1. **BM25** (primary) — Robertson/Sparck-Jones with k1=1.2, b=0.75, BM25+
   smoothed IDF so `(df + 0.5)` never divides by zero.
2. **TF-IDF bonus** (15% weight) — residual signal for very high raw tf.
3. **Local hint** (5% weight) — modules can optionally supply a `score`
   field that we preserve as a weak prior.

Score is computed against a **unified corpus** built from all responding
modules' results, so rankings are comparable cross-module even though each
index is independent.

Test case 24 verifies title matches outrank body-only matches.

---

## 7. Scatter/Gather / פיזור ואיסוף

- `Promise.all` over module `searchFn` invocations, each wrapped in
  `withTimeout(promise, ms, ctrl)` that races against a setTimeout which
  resolves (does NOT reject) with a `{ __timeout: true }` sentinel.
- An `AbortController` signal is passed into every module so well-behaved
  searchFns can cancel downstream work when the timeout fires.
- Partial failure modes handled in `diagnostics`:
  - `responded`  — modules that returned an array in time
  - `timedOut`   — modules that breached `timeoutMs`
  - `errored`    — modules that threw or returned non-array

Tests 20 and 21 verify timeout tolerance and throw tolerance respectively.

---

## 8. Permission Filtering / סינון הרשאות

```js
hasPermission(docAcl, callerPerms)
```

- **No ACL** on doc → public (everyone sees it).
- **ACL present + empty caller perms** → DENY (no metadata leak).
- **Intersection non-empty** → ALLOW.
- **Wildcard `'*'`** in caller perms → super-user ALLOW.

Critically, permission filtering runs **before scoring and facet building**,
so facet counts never reveal documents the caller cannot see.

Tests 8, 9, 15 validate the matrix.

---

## 9. HTML Safety / בטיחות HTML

- `escapeHtml(text)` escapes `& < > " ' \``.
- `highlightText(text, tokens)` **escapes first**, then re-scans the safe
  string word-by-word and wraps matches in `<mark>…</mark>`. The output is
  guaranteed safe for `innerHTML`.
- XSS payload `<script>alert("x")</script>` becomes
  `&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;` — verified in test 5.
- Hebrew highlighting works on normalized tokens so niqqud variants match.

---

## 10. Facets / פאסטות

Built **after** ACL filtering from the full scored result set (not just the
limited page), so facet counts reflect the true authorized corpus.

- **type**  — discrete document type histogram
- **owner** — per-owner histogram
- **date**  — bucketed to `YYYY-MM` (month granularity, UTC)

All facets returned as arrays sorted by `count DESC, key ASC` so the UI can
render deterministically.

---

## 11. Test Matrix / מטריצת בדיקות

| # | Name | Area |
|---|---|---|
| 1 | Hebrew niqqud + final letters | Tokenizer |
| 2 | English lowercase + stopwords | Tokenizer |
| 3 | Bilingual mixed input | Tokenizer |
| 4 | Final-letter normalization unit | Tokenizer |
| 5 | XSS escape sanity | Safety |
| 6 | Highlight wraps and escapes | Safety |
| 7 | Hebrew highlight variant | Safety |
| 8 | No ACL = public | Permissions |
| 9 | ACL matrix | Permissions |
| 10 | BM25 ranks matches above non-matches | Scoring |
| 11 | registerIndex validation | Lifecycle |
| 12 | unregisterIndex soft-disable | Lifecycle |
| 13 | Federated scatter/gather | Federator |
| 14 | Hebrew federated query | Federator |
| 15 | Permission filters results | Federator |
| 16 | Type whitelist filter | Federator |
| 17 | Limit caps results | Federator |
| 18 | Highlighted title + snippet | Federator |
| 19 | Facets built by type/owner/date | Facets |
| 20 | Timeout tolerance (partial results) | Resilience |
| 21 | Throwing module tolerance | Resilience |
| 22 | Empty query = list mode | Federator |
| 23 | YYYY-MM date buckets | Facets |
| 24 | Title > body BM25 ranking | Scoring |
| 25 | Module whitelist | Federator |

**Result: 25/25 PASS** (run: `node --test test/wiring/global-search.test.js`)

```
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ duration_ms ~613
```

---

## 12. Rule Compliance / עמידה בכללים

| Rule | Status | Notes |
|---|---|---|
| Never delete | PASS | `unregisterIndex` only soft-disables |
| Node built-ins only | PASS | Uses `node:test`, `node:assert`, `Promise.allSettled`, `AbortController`, `Map`, `Set` |
| Bilingual | PASS | Hebrew niqqud + final-letter normalization, English lowercase, both stopword lists |
| No external search engine | PASS | No Elasticsearch / Solr / Meilisearch dependency — pure JS BM25 |

---

## 13. Wiring Instructions / הוראות חיווט

To integrate into the Techno-Kol mega-ERP main server, a typical wiring would
be inside a bootstrap module:

```js
const { GlobalSearch } = require('./wiring/global-search');
const gs = new GlobalSearch({ defaultTimeoutMs: 300 });

// Each module self-registers at startup:
require('./po').registerGlobalSearch(gs);
require('./hr').registerGlobalSearch(gs);
require('./finance').registerGlobalSearch(gs);
// ... 30+ more modules

// Expose as HTTP endpoint:
app.get('/api/search', async (req, res) => {
  const result = await gs.query(req.query.q, {
    limit: Number(req.query.limit) || 20,
    types: req.query.types ? req.query.types.split(',') : undefined,
    perms: req.user.permissions,
    timeoutMs: 300,
  });
  res.json(result);
});
```

**Hebrew RTL** — consumers of `_titleHl` and `_snippetHl` should render
inside an element with `dir="auto"` so mixed content reverses correctly.
**עברית RTL** — צרכני `_titleHl` ו-`_snippetHl` צריכים לרנדר בתוך
אלמנט עם `dir="auto"` כדי שהתוכן המעורב יתהפך נכון.

---

## 14. Notes / הערות

- The per-module `searchFn` contract is intentionally loose: modules may
  return stale cached data, call an internal SQL full-text index, or hit an
  in-memory trie — the federator doesn't care as long as the return is a
  Promise of an array of hits with `id` + `type`.
- `limit` over-fetches from each module (`limit * 2`, min 20) so the unified
  reranker has enough candidates to dominate stale module-local scores.
- Date parsing uses `Date.UTC*` to avoid local-timezone drift; month facets
  are deterministic across test environments.
- No network I/O. No filesystem I/O. No global state. Safe for concurrent use.

---

**END OF REPORT / סוף הדו"ח**
