# AG-Y132 — Internal Wiki (Markdown + Versioning + Graph + TF-IDF)

**Agent:** Y-132
**System:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — 26 / 26 tests passing (`node --test test/comms/internal-wiki.test.js`)
**Siblings:** AG-X22 knowledge-base (`kb-engine.js`), AG-X14 search-engine, AG-Y121 email-templates

---

## 1. Summary / סיכום

| EN | HE |
|---|---|
| Y-132 delivers a zero-dependency internal wiki / knowledge base focused on **Markdown editing**, **append-only version history**, **line-level diffs**, **wiki-link graph analysis** (`[[Page Name]]`), **TF-IDF search** with a bilingual Hebrew tokeniser and **space-based navigation** (engineering, hr, finance, ops, onboarding, compliance). It is a UX sibling to Agent X-22's help-center, not a replacement. Both can coexist. | Y-132 מספק ויקי פנימי בלי תלויות, המתמקד בעריכה ב-Markdown, היסטוריית גרסאות הוספה-בלבד, דיפים ברמת שורה, גרף קישורי ויקי, חיפוש TF-IDF עם טוקניזר דו-לשוני, וניווט לפי מרחבים. זהו מודול אחאי למודול המרכז-העזרה של סוכן X-22, לא תחליף. |

**Immutable rules respected:**
- **"לא מוחקים רק משדרגים ומגדלים"** — versions array, watcher list, audit log and diff log are all append-only. `archivePage` flips status; nothing is ever removed.
- **Zero external deps** — only Node built-ins are used (in fact no imports at all in the module, only `node:test` + `node:assert/strict` in tests).
- **Hebrew RTL + bilingual labels** — every user-facing constant ships as `{ he, en }`.

---

## 2. Files Delivered

| # | Path | Purpose | LOC |
|---|---|---|---|
| 1 | `onyx-procurement/src/comms/internal-wiki.js` | Pure JS wiki engine (class `InternalWiki`) + Markdown mini-parser + TF-IDF search + graph analyzer | ~620 |
| 2 | `onyx-procurement/test/comms/internal-wiki.test.js` | Zero-dep test suite — 26 cases (minimum required: 20) | ~380 |
| 3 | `_qa-reports/AG-Y132-internal-wiki.md` | This report (bilingual) | — |

---

## 3. Public API

```js
const { InternalWiki } = require('./src/comms/internal-wiki');
const wiki = new InternalWiki();
```

| Method | Signature | Notes |
|---|---|---|
| `createPage` | `({title_he, title_en, slug, markdown, spaces, tags, author}) → Page` | Spaces must be a subset of `engineering, hr, finance, ops, onboarding, compliance`. Seeds version 1. |
| `updatePage` | `(pageId, {markdown, editor, summary}) → Page` | **Append-only**: pushes new entry to `versions[]`, logs diff to `_diffLog`. Same-content update is a no-op. |
| `getPage` | `(pageId, {version?}) → Page + {currentMarkdown, currentVersion}` | Latest by default; throws on unknown version. |
| `listVersions` | `(pageId) → HistoryEntry[]` | Returns `{version, editor, summary, at, size}` per revision. |
| `diffVersions` | `(pageId, v1, v2) → {ops, added, removed, summary}` | Line-level LCS diff. |
| `search` | `(query, {spaces?, tags?, authors?}) → Result[]` | TF-IDF with title boost + Hebrew tokeniser. |
| `linkGraph` | `(pageId) → {forward[], back[]}` | Parses `[[Page Name]]` references and back-links. |
| `broken_links` | `() → BrokenRef[]` | Active pages whose wiki-links point to unknown slugs. |
| `tableOfContents` | `(space) → {space, pages[]}` | Hierarchical headings per page in a space. |
| `exportMarkdown` | `(pageId) → {slug, markdown, version, ...}` | Returns raw markdown of current version. |
| `importMarkdown` | `(content, meta?) → {imported_count, pages[]}` | Accepts a single string or an array of records. |
| `recentChanges` | `(limit) → AuditEntry[]` | Newest first, backed by append-only `_auditLog`. |
| `watchers` | `(pageId, {subscribe?, unsubscribe?}) → {active, history, notifyBridge}` | Append-only — `unsubscribe` records a new row with `active:false`, never deletes prior entries. `notifyBridge: 'Y-121 email-templates (delegated)'`. |
| `archivePage` | `(pageId) → Page` | Flips `status` to `archived`, adds `archived_at`; nothing removed. |
| `stats` | `() → {total, active, archived, versions, diffLog}` | Introspection helper. |

Exported helpers for tooling and tests: `parseMarkdown`, `parseInline`, `extractWikiLinks`, `astToText`, `tokenize`, `stripHebrewPrefix`, `slugify`, `lineDiff`.

---

## 4. Markdown Syntax Table / טבלת תחביר Markdown

| Feature | Syntax | EN | HE |
|---|---|---|---|
| Heading H1–H6 | `# ... ###### ...` | Six heading levels | שש רמות כותרת |
| Unordered list | `- item` / `* item` | Bulleted list | רשימה עם תבליטים |
| Ordered list | `1. item` | Numbered list | רשימה ממוספרת |
| Bold | `**text**` or `__text__` | Bold emphasis | הדגשה מודגשת |
| Italic | `*text*` or `_text_` | Italic emphasis | הדגשה נטויה |
| Inline code | `` `code` `` | Monospaced span | קוד בשורה |
| Link | `[label](url)` | Hyperlink | קישור חיצוני |
| Wiki-link | `[[Page Name]]` | Internal wiki reference, resolved by slug | קישור ויקי פנימי |
| Fenced code block | `` ```lang ... ``` `` | Code block with language tag | בלוק קוד עם שפה |
| Paragraph | Any non-matching line run | Paragraph block | פסקה |
| Blank | Empty line | Blank block separator | שורה ריקה |

The parser produces a deterministic AST:

```
document
├── heading  { level: 1-6, children: inline[] }
├── list     { ordered, items: [{children: inline[]}] }
├── codeblock{ lang, value }
├── paragraph{ children: inline[] }
└── blank
```

Inline nodes: `text`, `strong`, `em`, `code`, `link`, `wikilink`.

---

## 5. Search Algorithm / אלגוריתם חיפוש

**Scoring:** TF-IDF over the combined blob `title_he + title_en + markdown + tags` per page.

```
score(d, q) = Σ_{t∈q ∩ d}  ( tf(t,d) / |d| ) · log( 1 + N / df(t) )
```

- `tf(t, d)` — raw term frequency of token `t` in doc `d`.
- `|d|` — number of tokens in the doc after Hebrew prefix stripping and stopword drop.
- `df(t)` — number of docs containing `t` across the candidate set.
- `N` — number of candidate docs after space / tags / authors filtering.
- **Title boost ×2.0** when the normalized query is a substring of the title blob.

**Tokeniser pipeline** — shared between search and indexing so queries and docs are comparable:

1. Normalize case + strip nikkud (Unicode `\u0591-\u05C7`).
2. Match Hebrew words (`\u05D0-\u05EA`+), English words, and digits.
3. Drop tokens shorter than 2 chars.
4. Strip a single Hebrew prefix if present. Ordered prefix list: `ול, וכש, וב, וה, וכ, כש, מה, של, ב, ל, ה, מ, ו, כ, ש`. Only one prefix is stripped — we aim for lexical normalization, not grammatical parsing.
5. Drop Hebrew/English stopwords.

**Filters** — `search` accepts `{spaces, tags, authors}`, each an array. Archived pages are excluded from search results (they remain accessible via `getPage`).

**Empty / stopword-only query** returns `[]` by contract.

---

## 6. Hebrew Glossary / מילון עברית

| EN Term | Hebrew term | Usage |
|---|---|---|
| Page | דף | "Page", basic unit of the wiki |
| Pages | דפים | Plural |
| Version | גרסה | Snapshot inside `versions[]` |
| History | היסטוריה | Full version list |
| Diff | השוואה | Line-level change report |
| Search | חיפוש | TF-IDF query entry point |
| Table of Contents | תוכן עניינים | Heading tree per page |
| Recent Changes | שינויים אחרונים | Audit feed |
| Watchers | עוקבים | Users subscribed to a page |
| Broken Links | קישורים שבורים | Wiki refs pointing at unknown slugs |
| Archive | העבר לארכיון | `archivePage` action |
| Active | פעיל | Active page status |
| Archived | בארכיון | Archived page status |
| Space | מרחב | engineering/hr/finance/ops/onboarding/compliance |
| Author | מחבר | Original author |
| Editor | עורך | Later contributor |
| Summary | תקציר | Commit-style summary on update |
| Tags | תגיות | Page tag list |
| Wiki Links | קישורי ויקי | `[[...]]` references |
| Forward Links | קישורים יוצאים | Outgoing links from a page |
| Back Links | קישורים נכנסים | Incoming links to a page |
| Nikkud | ניקוד | Hebrew diacritics, stripped during tokenisation |
| Prefix | תחילית | Letter particle stripped before comparison |
| Onboarding | קליטת עובדים | HR use-case space |
| Compliance | רגולציה | Legal/regulatory space |
| Engineering | הנדסה | Engineering space |
| Operations | תפעול | Ops space |
| Finance | כספים | Finance space |
| HR | משאבי אנוש | Human Resources space |

All labels are exported as `BILINGUAL_LABELS` so every UI can `label.he` or `label.en` without duplicating strings.

---

## 7. Append-Only Guarantees / ערבויות הוספה-בלבד

| Mutation path | Data structure | Guarantee |
|---|---|---|
| `createPage` | `_pages` Map + `_slugIndex` | Throws on duplicate slug; never overwrites. |
| `updatePage` | `page.versions[]` | New row pushed, prior rows untouched. Same-content update is a silent no-op (still non-destructive). |
| `updatePage` | `_diffLog[]` | Each update appends a diff-summary row. |
| `watchers` (subscribe/unsubscribe) | `page.watchers[]` | Every subscribe/unsubscribe is appended as a new row; prior rows retain their original `active` flag and timestamp. Effective list is computed by replay. |
| `archivePage` | `page.status` + `page.archived_at` | Flips status once; re-archiving a page is idempotent. |
| `importMarkdown` | Calls `createPage` per record | Duplicates still throw, same as normal create. |

The class never calls `delete`, never splices prior entries, never mutates a historical version in-place.

---

## 8. Test Matrix / מטריצת בדיקות

`node --test test/comms/internal-wiki.test.js`

```
✔ 1  constants and labels export correctly
✔ 2  createPage seeds version 1 and indexes slug
✔ 3  createPage validates required fields and spaces
✔ 4  createPage rejects duplicate slug
✔ 5  updatePage pushes a new version (append-only)
✔ 6  updatePage same-content is a no-op but does not throw
✔ 7  getPage returns latest by default and specific version on request
✔ 8  listVersions returns full history metadata
✔ 9  diffVersions computes line-level adds / removes
✔ 10 lineDiff unit: identical inputs produce no changes
✔ 11 Hebrew tokeniser strips nikkud and common prefixes
✔ 12 slugify produces URL-safe slugs (Hebrew kept)
✔ 13 parseMarkdown handles headings, lists, code, links, wiki-links
✔ 14 extractWikiLinks finds all [[...]] references
✔ 15 search ranks TF-IDF and supports space/tag/author filters
✔ 16 search returns [] for empty or stopword-only queries
✔ 17 Hebrew search matches across prefixes
✔ 18 linkGraph returns forward + back links
✔ 19 broken_links detects dangling wiki references
✔ 20 archivePage flips status but never deletes data
✔ 21 importMarkdown bulk-imports a list of pages
✔ 22 recentChanges returns append-only audit feed (newest first)
✔ 23 watchers append-only + delegation to Y-121
✔ 24 tableOfContents returns headings grouped per page in space
✔ 25 exportMarkdown returns current raw markdown
✔ 26 stats reports totals across lifecycle

ℹ tests 26  pass 26  fail 0  skipped 0  duration_ms ≈ 158
```

All the requested coverage is represented:

- create/update versioning — tests 2, 5, 6
- diff computation — tests 9, 10
- TF-IDF search — tests 15, 16
- Hebrew tokeniser — tests 11, 17
- Wiki-link extraction — tests 13, 14, 18
- Broken links — test 19
- archivePage — test 20
- Bulk import — test 21

---

## 9. Integration Contracts

- **Y-121 Email templates** — `watchers()` returns `notifyBridge: 'Y-121 email-templates (delegated)'` as a contract hint to a caller that wants to send notifications. Y-132 itself never emits mail.
- **X-14 Search engine** — not required but not prevented; the same tokeniser style is used so results can be merged.
- **X-22 KB engine** — Y-132 is complementary. X-22 stores structured help-center articles with bilingual body/title and FAQs; Y-132 stores Markdown pages with append-only history and a wiki link graph. Both can be mounted side-by-side.

---

## 10. Compliance Checklist / רשימת בדיקה לציות

- [x] Zero external dependencies (`require` / `import` count in `internal-wiki.js`: **0**).
- [x] `node --test` passes (26 / 26).
- [x] Bilingual labels exported (`BILINGUAL_LABELS`, `SPACES`).
- [x] Append-only writes (verified by tests 5, 6, 20, 22, 23).
- [x] Hebrew RTL normalisation (nikkud + prefix stripping — tests 11, 17).
- [x] Markdown parser covers all required constructs — test 13.
- [x] Wiki-link graph with forward + back links — test 18.
- [x] Broken-link detector — test 19.
- [x] Archive never deletes — test 20.
- [x] `recentChanges` audit feed — test 22.
- [x] Bulk import — test 21.
- [x] Delegation hint to Y-121 — test 23.

---

**End of report — AG-Y132.**
