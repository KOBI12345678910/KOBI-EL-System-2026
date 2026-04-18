# AG-Y112 — Document Search Engine (Bilingual Hebrew + English)

**Agent:** Y-112
**Swarm:** Documents (Y-106 doc-vc, Y-113 metadata, **Y-112 doc-search**)
**System:** Techno-Kol Uzi mega-ERP — ONYX Procurement subsystem
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 30 / 30 tests passing (`node --test test/docs/doc-search.test.js`)
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים

---

## 1. Mission | משימה

Build a zero-dependency, in-memory, bilingual full-text search engine
for the ERP's document management stack. The engine must:

* Handle mixed Hebrew RTL + English LTR content in the same document
* Strip Hebrew nikud and one-letter prefixes (ב, כ, ל, מ, ש, ה, ו)
* Perform BM25 + TF-IDF scoring with standard parameters (k1 = 1.2, b = 0.75)
* Support phrase queries via a positional index
* Offer fuzzy search via Levenshtein expansion
* Return HTML-safe highlights (escape then wrap in `<mark>`)
* Compute facet counts per `docType`, `tag`, `department`
* Never delete raw data — soft-unindex only, append-only mutation log
* Run on Node built-ins only (no `npm install`)

בניית מנוע חיפוש דו-לשוני (עברית מימין-לשמאל + אנגלית משמאל-לימין)
ללא תלות חיצונית כלשהי, עם ניקוד BM25/TF-IDF, אינדקס פוזיציונלי,
חיפוש מעומעם (Levenshtein), הדגשה בטוחה מול HTML, ופציטים.
חובה: לא מוחקים נתונים — רק מתייגים כ־archived/superseded ומשמרים
בארכיון עם יומן־מוטציות append-only.

## 2. Deliverables | תוצרים

| File | Purpose |
|---|---|
| `onyx-procurement/src/docs/doc-search.js` | Engine (`DocSearch` class + tokenizer + helpers) |
| `onyx-procurement/test/docs/doc-search.test.js` | 30 unit tests covering all public methods |
| `_qa-reports/AG-Y112-doc-search.md` | This report |

* Zero new dependencies introduced
* Zero files deleted
* Zero external network calls
* Zero filesystem writes (engine is pure in-memory)

## 3. Architecture | ארכיטקטורה

### 3.1 Index structure

```
inverted:  Map<term, Map<docId, Posting>>
docLen:    Map<docId, number>           // token count for BM25
docMeta:   Map<docId, Meta>             // status, versionId, tags, docType…
_rawDocs:  Map<docId, RawVersion[]>     // append-only history
_archive:  Map<docId, ArchiveEntry[]>   // soft-unindex snapshots
_log:      Array<MutationEntry>         // append-only mutation log

Posting {
  docId, tf, positions[], field, status, versionId
}
```

Every mutation — `indexDocument`, `removeFromIndex`, `reindex` — appends
one entry to `_mutationLog` via the private `_logMutation()` helper.
The log is monotonically ordered by `seq`.

### 3.2 BM25 formula (Robertson / Spärck Jones)

```
              tf(q,D) · (k1 + 1)
score(D,Q) = Σ  IDF(q) · ─────────────────────────────────────
            q∈Q          tf(q,D) + k1 · (1 - b + b · |D|/avgdl)

IDF(q)  = ln( (N - df(q) + 0.5) / (df(q) + 0.5) + 1 )

k1 = 1.2, b = 0.75  (library defaults)
```

With `N` = number of live docs, `df(q)` = docs containing term `q`,
`|D|` = token length of doc D, `avgdl` = rolling average doc length.

### 3.3 TF-IDF fallback

```
tfidf(q,D) = (tf(q,D) / |D|) · ln( (N + 1) / (df(q) + 1) ) + 1
```

Exposed via `query(q, { scorer: 'tfidf' })`.

### 3.4 Tokenizer algorithm

1. **Raw extraction** — regex `[\u0590-\u05FF]+|[A-Za-z]+|[0-9]+` pulls
   maximal runs of Hebrew letters, Latin letters, or digits. Nikud is
   stripped via `stripNikud` (strip `[\u0591-\u05C7]`) before the pass.
2. **Per-token normalisation**:
   * Hebrew → build **all variants**:
     `{ surface, prefix-stripped, suffix-stripped, prefix+suffix }`
     Each variant ≥ 2 chars is added. Dual-indexing keeps recall high
     without distorting phrase adjacency — the primary (surface) form
     always comes first, so `phraseQuery` still matches literal order.
   * Latin → lowercase → naive stem (strip ing/ed/es/s when residue ≥ 3)
   * Digits → pass-through (preserve invoice numbers, year stamps, …)
3. **Stop-word drop** — language-specific sets (`HEBREW_STOPWORDS`,
   `ENGLISH_STOPWORDS`). Dropped tokens never reach the index.
4. **Position assignment** — every raw token gets a monotonic ordinal
   that feeds `phraseQuery`. Variants share the same ordinal.

### 3.5 Hebrew glossary | מילון מונחים

| Hebrew | Transliteration | English |
|---|---|---|
| חיפוש | chipus | search |
| מסמך / מסמכים | mismach / mismachim | document / documents |
| אינדקס | indeks | index |
| ניקוד | nikud | Hebrew diacritics |
| תחילית | tchilit | prefix |
| סיומת | siyomet | suffix |
| גזע | geza | stem |
| ציון | tziyun | score |
| שאילתה | she'eilta | query |
| מטא־דאטה | meta data | metadata |
| תגית / תגיות | tagit / tagiyot | tag / tags |
| גרסה | girsa | version |
| שדרוג | shidrug | upgrade |
| ארכיון | archion | archive |
| יומן | yoman | log |
| שיבוץ הדגשה | shibbutz hadgasha | highlight wrapping |
| אוטו־השלמה | auto-hashlama | autocomplete |

### 3.6 Hebrew prefixes stripped

| Letter | Meaning |
|---|---|
| ב | "in / at" |
| כ | "like / as" |
| ל | "to / toward" |
| מ | "from" |
| ש | "that / which" |
| ה | definite article "the" |
| ו | "and" |

Prefixes are stripped only when the residue is ≥ 3 chars AND the
original word is ≥ 4 chars, to protect short stems like "הר" (mountain).

### 3.7 Hebrew suffixes stripped

| Suffix | Use |
|---|---|
| ים | masculine plural |
| ות | feminine plural |
| יה | possessive 3fs |
| ון | diminutive / noun ending |

Only ≥ 4-char words get their suffix stripped, and only one pass —
aggressive multi-pass stemming was rejected because it collapsed
distinct roots onto the same index term.

## 4. Public API — class `DocSearch`

| Method | Contract |
|---|---|
| `indexDocument({docId, title_he, title_en, content, metadata, tags, versionId})` | Builds inverted index; supersedes prior version (append-only) |
| `removeFromIndex(docId, versionId)` | Soft-unindex — status flip to `archived`, keeps raw data |
| `query(q, {filters, limit, offset, boost, scorer})` | BM25 (default) or TF-IDF |
| `queryHebrew(q, opts?)` | NFKC-normalize + route through main query |
| `phraseQuery(phrase, opts?)` | Exact-phrase match on positional index |
| `fuzzySearch(q, {maxDistance})` | Levenshtein expansion around query terms |
| `suggestCorrections(term, {limit, maxDistance})` | Ranked spell-check suggestions |
| `highlight(content, query, {pre, post})` | HTML-escape then wrap matches in `<mark>` |
| `facets(q, opts?)` | Counts per `docType` / `tag` / `department` |
| `autocomplete(prefix, limit)` | Prefix-match ranked by df |
| `reindex({fullHistory?})` | Rebuild live postings from `_rawDocs` |
| `stats()` | docCount, termCount, postings, avgDocLen, … |
| `getMutationLog()` | Returns a copy of the append-only mutation log |

Filters accept `{docType, tags, tagsMode: 'any'|'all', department,
dateRange: {from?, to?}, status}`. Status defaults to `['live']` so
archived/superseded docs are invisible to live search but still
addressable through `_rawDocs` / the archive Map.

## 5. Test coverage | כיסוי בדיקות

30 tests, all passing. Mapping from spec → test:

| Spec requirement | Test(s) |
|---|---|
| Indexing returns posting count and docLen | T08 |
| TF-IDF scoring | T10 |
| BM25 scoring — rare term beats common | T09 |
| Hebrew tokenizer — nikud strip | T03 |
| Hebrew tokenizer — prefix strip | T04, T12 |
| Hebrew tokenizer — suffix strip | T05 |
| English stemmer + stop-words | T06, T07 |
| Mixed Hebrew + English tokenization | T02, T11, T30 |
| Phrase query — positive | T13 |
| Phrase query — negative (non-adjacent) | T14 |
| Fuzzy Levenshtein search | T15 |
| Levenshtein primitive correctness | T16 |
| Spellcheck suggestions | T17 |
| Safe HTML highlight escaping | T18, T19 |
| Facet counts by docType / tag / department | T20 |
| Autocomplete prefix | T21 |
| Filters — docType / tags / department / dateRange | T22, T23, T24 |
| Soft removal (append-only) | T25 |
| Reindex rebuilds from raw history | T26 |
| Supersede prior version | T27 |
| Append-only mutation log | T28 |
| Stats shape | T29 |
| Constants exported | T01 |

Run:

```
cd onyx-procurement
node --test test/docs/doc-search.test.js
# or the whole folder:
node --test test/docs
```

## 6. "לא מוחקים רק משדרגים ומגדלים" — proof

| Operation | Destructive? | Evidence |
|---|---|---|
| `indexDocument` of existing docId | No — moves current postings to `_archive`, appends new raw history entry | `_archiveLive(docId, 'superseded')` + `_rawDocs.set(docId, history)` |
| `removeFromIndex` | No — flips status to `archived`, keeps snapshot + raw history | `_archiveLive(docId, 'archived')` + `_rawDocs` untouched |
| `reindex` | No — live maps are reset **from** `_rawDocs`, source is never pruned | `const source = new Map(); for (const [id, h] of _rawDocs) source.set(id, h.slice());` |
| Mutation log | Append-only | `_logMutation` only pushes; no removal API |
| Archive | Append-only | `_archive` gets a new snapshot per transition; prior snapshots retained |

Test T25 confirms that after `removeFromIndex('D1')` the raw-docs map
still reports `rawDocsTracked: 4`, live-count drops to 3, and
archived-count is 1. Test T28 confirms the mutation log is
monotonic and contains no `delete`-type op.

## 7. Safe highlighting | הדגשה בטוחה

`highlight()` scans the **raw** source for matching tokens, then
writes the output in chunks: every non-match chunk is pushed through
`escapeHtml`, every match chunk is wrapped in `<mark>` (escaped
content between the tags). Arbitrary input like `<script>invoice</script>`
becomes `&lt;script&gt;<mark>invoice</mark>&lt;/script&gt;` — verified
by T18. The default wrapper is `<mark>…</mark>`, overridable via
`{pre, post}` so callers can pass language-aware spans such as
`<span dir="rtl" class="hit">`.

## 8. Integration points | נקודות חיבור

* **Y-106 `doc-vc`** — supply every new revision through
  `indexDocument({docId, versionId, …})`. The engine supersedes prior
  revisions in place while keeping the raw history for reindex.
* **Y-113 `metadata`** — set `metadata.docType`, `metadata.department`,
  and `tags[]` for filter / facet parity. `tags` are indexed as
  first-class searchable terms through the bilingual tokenizer.
* **Future UI (RTL)** — call `highlight(content, q, {pre: '<span dir="rtl" class="hit">', post: '</span>'})`
  for Hebrew snippets and `{pre: '<mark>', post: '</mark>'}` for mixed.

## 9. Known limitations

1. Naive stemmer for both languages — good enough for ERP search but
   not a replacement for a proper morphological analyser.
2. Hebrew prefix stripping treats one-letter prefixes only; the rare
   two-letter combinations (e.g. `ומה` = "and the") are not handled.
3. Highlight de-duplicates overlapping matches by skipping hits that
   fall inside a previously wrapped region — adequate for snippets,
   not for advanced regex-driven highlight.
4. Fuzzy search scans the full term vocabulary; for a corpus of
   > 1M terms consider a precomputed BK-tree. The current corpus
   (ERP documents) is well below that threshold.

## 10. Sign-off

* Tests: 30 / 30 passing (`node --test test/docs/doc-search.test.js`)
* Dependencies: zero external packages
* Data-preservation rule: enforced in code and proven in tests
* Bilingual: Hebrew RTL + English LTR in the same document, queries,
  and highlights

Agent **Y-112** ready for Swarm-Docs integration.
