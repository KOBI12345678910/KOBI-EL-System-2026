# AG-X22 — Internal Knowledge Base / Help Center

**Agent:** X-22 (Swarm 3B)
**System:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — 23/23 tests passing

---

## 1. Summary

Agent X-22 delivers a complete, zero-dependency internal knowledge base and
help center for the Techno-Kol Uzi mega-ERP. The module provides bilingual
(Hebrew + English) articles, hierarchical categories, FAQ blocks, full-text
search, strict versioning (never delete), popularity tracking and a
Palantir-dark React UI with RTL support.

---

## 2. Files Delivered

| # | Path | Purpose | LOC |
|---|------|---------|-----|
| 1 | `onyx-procurement/src/kb/kb-engine.js` | Pure JS KB engine (create/update/search/feedback/versioning) + 10-article seed | 948 |
| 2 | `payroll-autonomous/src/components/HelpCenter.jsx` | React UI (Palantir-dark, Hebrew RTL, bilingual) | 915 |
| 3 | `test/payroll/kb-engine.test.js` | Zero-deps test suite — 23 cases | 407 |
| 4 | `_qa-reports/AG-X22-knowledge-base.md` | This report | — |

---

## 3. Engine — Public API (kb-engine.js)

Returned from `createKB(opts)`:

| Function | Signature | Notes |
|---|---|---|
| `upsertCategory` | `(cat) → Category` | Bilingual name, optional parent, FAQs |
| `listCategories` | `() → Category[]` | Flat list with parent/children |
| `getCategory` | `(catId) → {category, articles[]}` | Null if not found |
| `createArticle` | `({title, body, category, tags, related?}) → Article` | Bilingual enforcement |
| `updateArticle` | `(id, changes) → Article` | **Versioned** — always pushes a snapshot to `versions[]` |
| `getArticle` | `(id, {incrementViews}) → Article` | Optional view bump |
| `deleteArticle` | `(id) → throws` | **Never delete rule** — explicit error |
| `searchKB` | `(query, lang) → [{article, score, snippet}]` | BM25-lite; falls back to substring if nothing; respects external Agent X-14 search engine if passed as `opts.externalSearch` |
| `markHelpful` | `(id, boolean) → {helpful_count, not_helpful_count}` | Pure increment, no decrement |
| `getPopular` | `(limit) → Article[]` | Sorted by `views` desc |
| `getRelated` | `(id, limit) → Article[]` | Explicit related[] first, then same category, sorted by views |
| `diffVersions` | `(id, a, b) → {added[], removed[], unchanged[]}` | Token-level diff across versions |

Engine highlights:

- **Zero deps** — no `require` calls outside Node built-ins (`path`, `assert`
  only in tests).
- **Hebrew-aware tokeniser** — strips nikud (U+0591-U+05C7), normalises case,
  drops Hebrew + English stop-words.
- **BM25-lite scoring** — full inverted index built per search; IDF + TF +
  length-normalised. Single docs that repeat the query term rank higher than
  docs that mention it only once (test 23 proves this).
- **External search bridge** — if `opts.externalSearch` is a function, it is
  called first with `{query, lang, docs}` and its result is used if it is an
  array. Falls through transparently to BM25 on error. This is how Agent X-14's
  search engine plugs in.
- **Never-delete rule** enforced at two levels: `deleteArticle()` throws, and
  `updateArticle()` always snapshots the previous state into `versions[]`.

---

## 4. Seed Content — 10 bilingual articles

Each article ships with **real**, non-placeholder content in both Hebrew and
English. Each body is ≥ 100 characters in both languages (validated by test 2).

| # | id | Category | Hebrew title | English title |
|---|----|----------|---|---|
| 1 | kb-payroll-wage-slip | payroll | איך להפיק תלוש שכר | How to generate a wage slip |
| 2 | kb-tax-income-2026 | tax | חישוב מס הכנסה 2026 | 2026 income tax calculation |
| 3 | kb-acc-invoice-allocation | accounting | חשבונית עם מספר הקצאה | Invoices with allocation numbers |
| 4 | kb-reports-1320 | reports | הפקת טופס 1320 | Generating form 1320 |
| 5 | kb-payroll-severance | payroll | חישוב פיצויים | Severance calculation |
| 6 | kb-benefits-recreation | benefits | דמי הבראה 2026 | Recreation pay 2026 |
| 7 | kb-social-ni-employer | social | ביטוח לאומי מעסיק | Employer NI contributions |
| 8 | kb-social-study-fund | social | קרן השתלמות | Study fund |
| 9 | kb-tools-salary-sim | tools | סימולטור משכורת | Salary simulator |
| 10 | kb-ops-backup-restore | ops | גיבוי ושחזור | Backup and restore |

**Categories (8):** payroll, tax, accounting, reports, benefits (child of
payroll), social (child of payroll), tools, ops.

**FAQs:** payroll category ships with 2 bilingual FAQs (wage-slip payment
deadlines, cash vs. transfer). tax category ships with 1 bilingual FAQ (2026
first bracket).

---

## 5. UI — HelpCenter.jsx

- **Theme:** Palantir dark (bg `#0b0d10`, panel `#13171c`, accent `#4a9eff`).
- **RTL:** direction is set on the root based on `lang` prop, defaults to `he`.
- **Bilingual switch:** top-right button flips language; all labels, dates
  (he-IL vs. en-GB), category names, article titles and bodies re-render.
- **Layout:** 3-pane (left = category tree + popular, center = list/article,
  right = related sidebar), using CSS grid in a single inline `styles` object.
  Still responsive via `grid-template-columns: 220px 1fr 220px`.
- **Features:**
  - Search bar with Enter-key submit + clear button
  - Category tree (hierarchical, indents children)
  - Article list with title, version, date, views, tags
  - Article view with breadcrumb, meta row, paragraph body, tags row
  - "Was this helpful?" feedback (good/bad buttons, post-submit thank-you)
  - Related articles right sidebar (auto-populated via `getRelated`)
  - Popular articles in left sidebar (auto-populated via `getPopular`)
  - FAQs block per category, shown above the article list
- **Resilience:** if `kb` prop is missing, renders a clear error tile and
  never crashes. Feedback handler catches errors silently.
- **Zero deps:** only `react` hooks used (`useState`, `useMemo`, `useCallback`,
  `useEffect`). No CSS imports, no UI libraries.
- **A11y:** `lang` attribute set on root, `aria-label` on search / category
  tree / article body, `aria-pressed` on selected category button.

---

## 6. Test Suite — 23 cases, all passing

Run: `node test/payroll/kb-engine.test.js`

```
  ok   1. createKB() seeds 10 articles and 8 categories
  ok   2. seeded articles are bilingual and non-empty
  ok   3. createArticle() requires bilingual title + body + category
  ok   4. updateArticle() creates a new version and keeps the old one
  ok   5. updateArticle() increments versions monotonically
  ok   6. deleteArticle() is refused (never-delete rule)
  ok   7. searchKB() finds Hebrew articles by Hebrew query
  ok   8. searchKB() finds English articles by English query
  ok   9. searchKB() is ranked by relevance (BM25-lite)
  ok   10. searchKB() returns empty for empty query, not throws
  ok   11. searchKB() falls back to substring when BM25 finds nothing
  ok   12. getCategory() returns category + all its articles
  ok   13. categories have FAQs and hierarchy
  ok   14. markHelpful() increments the right counter only
  ok   15. getPopular() sorts by view count desc
  ok   16. getRelated() prefers explicit related, then same category
  ok   17. getRelated() fills from same category when explicit not enough
  ok   18. diffVersions() returns added / removed tokens across versions
  ok   19. getArticle() optionally increments view counter
  ok   20. external search engine takes precedence when provided
  ok   21. tokeniser strips nikud and normalises case
  ok   22. stopwords are dropped from tokenisation
  ok   23. searchKB() score rises with repeated query terms in document

kb-engine: 23/23 tests passed
```

### Coverage by area

| Area | Tests | Status |
|---|---|---|
| Seed integrity | 1, 2 | PASS |
| Article creation + validation | 3 | PASS |
| Versioning (never-delete) | 4, 5, 6 | PASS |
| Search — Hebrew | 7, 9, 11, 21 | PASS |
| Search — English | 8 | PASS |
| Search — edge cases | 10 | PASS |
| Search — external engine | 20 | PASS |
| Scoring correctness | 9, 23 | PASS |
| Tokenisation / nikud / stopwords | 21, 22 | PASS |
| Categories + hierarchy + FAQs | 12, 13 | PASS |
| Feedback | 14 | PASS |
| Popularity / views | 15, 19 | PASS |
| Related suggestions | 16, 17 | PASS |
| Diff / version history | 18 | PASS |

**Total: 23 tests covering all 12 exported functions.**

---

## 7. Compliance check vs. task requirements

| Requirement | Status | Notes |
|---|---|---|
| Never delete | ✓ | `deleteArticle` throws; `updateArticle` always snapshots |
| Hebrew RTL bilingual | ✓ | `he` + `en` on every field, RTL direction on UI root |
| Zero deps | ✓ | Only Node built-ins + React hooks |
| `kb-engine.js` created | ✓ | 948 LOC, 12 exported functions |
| `HelpCenter.jsx` created | ✓ | 915 LOC, Palantir dark, RTL |
| Article structure (id/title/body/cat/tags/author/version/dates/views/helpful/not_helpful) | ✓ | See Article shape doc-block in engine |
| Categories hierarchy | ✓ | parent + children[], benefits/social are children of payroll |
| FAQs per category | ✓ | payroll (2), tax (1) |
| Related articles | ✓ | Explicit related[] + same-category fallback |
| Full-text search (Agent X-14 fallback) | ✓ | BM25 + external bridge + substring fallback |
| Versioning with diff | ✓ | `diffVersions()` returns added/removed/unchanged tokens |
| `createArticle` / `updateArticle` / `searchKB` / `getCategory` / `markHelpful` / `getPopular` | ✓ | All exported and tested |
| UI: search bar / category tree / article view / breadcrumb / feedback / related sidebar / RTL | ✓ | All present |
| Test file with ≥ 15 cases | ✓ | 23 cases, all passing |
| 10+ real seeded articles (Hebrew + English) | ✓ | 10 articles, real content (not lorem) |
| QA report | ✓ | This file |

---

## 8. Known limitations / future work

- **Persistence:** the engine is purely in-memory. Persistence is deliberately
  out of scope — integration with the ERP's snapshot/backup pipeline (Agent
  X-??) is a separate concern.
- **Search indexing:** BM25 index is built on every search call. For ~10
  articles this is negligible; for thousands it would want caching.
- **Diff granularity:** `diffVersions` operates on Hebrew tokens only at
  present, not paragraphs. Adequate for "what changed" summaries; a
  paragraph-level diff would be a later enhancement.
- **Accessibility:** ARIA labels cover primary controls. Full WCAG AA audit
  can be piped through Agent X-81 (i18n / a11y audit agent) once the UI is
  wired into the main router.

---

## 9. Acceptance

**Delivered by:** Agent X-22
**Reviewed by:** self-attested (all 23 tests green)
**Sign-off:** ready for integration with Techno-Kol Uzi mega-ERP main shell.
