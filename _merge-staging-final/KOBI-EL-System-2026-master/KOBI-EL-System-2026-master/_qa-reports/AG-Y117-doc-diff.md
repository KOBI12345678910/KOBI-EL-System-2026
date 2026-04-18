# AG-Y117 — Document Diff Engine (DocDiff)
**Agent**: Y-117 / Swarm Office Docs
**Module**: `onyx-procurement/src/docs/doc-diff.js`
**Tests**:  `onyx-procurement/test/docs/doc-diff.test.js`
**Status**: GREEN — 37/37 passing on `node --test`
**Date**:   2026-04-11

---

## 1. Purpose / תכלית

**EN** — Structured, zero-dependency comparison of two document versions at
line / word / character / section granularity, with bilingual RTL output.
Complements Agent Y-106 (Document Version Control) by explaining *what*
changed between any two revisions. Used by contracts, policies, marketing
collateral, quotes, and internal memos.

**HE** — מנוע השוואה מובנה וחסר תלויות חיצוניות לשתי גרסאות של מסמך,
ברמת שורה / מילה / תו / סעיף, כולל פלט דו-לשוני עם תמיכה ב-RTL.
משלים את סוכן Y-106 (בקרת גרסאות מסמכים) על ידי הסבר *מה* השתנה בין
שתי רוויזיות. בשימוש ע"י חוזים, מדיניות, חומרי שיווק, הצעות מחיר
ומזכרים פנימיים.

---

## 2. Immutable rules / חוקי יסוד בלתי-שבירים

1. **לא מוחקים רק משדרגים ומגדלים** — operations named "delete" in a diff are
   *descriptive* markers, never destructive instructions. The underlying
   documents are immutable.
2. **Zero external dependencies** — only `node:test` and `node:assert` from
   Node built-ins. No npm packages. No transitive surface.
3. **Hebrew RTL + bilingual labels** on every public structure (`DIFF_OPS`,
   `LABELS`, `MERGE_KINDS`).
4. **Grapheme-aware** — Hebrew nikkud (ניקוד) combining marks stay glued to
   their base letter so a nikkud toggle produces exactly one edit, not one
   per codepoint.
5. **Final letters are distinct** — ך ם ן ף ץ never compare equal to their
   medial forms כ מ נ פ צ.
6. **HTML output is XSS-safe** — every user-originated string is escaped with
   the OWASP base-5 set (`& < > " '`).
7. **Pure / stateless** — `DocDiff` holds no instance state; all methods work
   identically whether called as `new DocDiff().diffLines(...)` or
   `DocDiff.diffLines(...)`.

---

## 3. Myers O(ND) algorithm summary / תקציר אלגוריתם מאיירס

**EN** — We use Eugene Myers' "An O(ND) Difference Algorithm" (1986). The
algorithm computes the shortest edit script (SES) between sequences `A` and
`B` by walking an edit graph from `(0,0)` to `(N,M)`, where moving right
represents *insert from B*, moving down represents *delete from A*, and a
diagonal represents *equal*. The array `V[k]` stores the furthest-reaching
x-coordinate on diagonal `k` at iteration `D`; at each step we extend every
diagonal by following "snakes" of equal elements. When we hit `(N,M)` we
stop; `D` is the number of non-diagonal edits. We snapshot every `V` so we
can backtrack and reconstruct the path.

**HE** — שימוש באלגוריתם O(ND) של יוג'ין מאיירס (1986). האלגוריתם מחשב
את סקריפט העריכה הקצר ביותר (SES) בין רצפים `A` ו-`B` על ידי מעבר בגרף
עריכה מ-`(0,0)` ל-`(N,M)`: מעבר ימינה = הוספה מ-B, מעבר למטה = מחיקה
מ-A, אלכסון = שוויון. הווקטור `V[k]` שומר את מיקום ה-x הרחוק ביותר
באלכסון `k` באיטרציה `D`. בכל שלב מורחבים האלכסונים לאורך "נחשים" של
איברים שווים. כשמגיעים ל-`(N,M)` עוצרים; הערך `D` הוא מספר העריכות
הלא-אלכסוניות. כל `V` נשמר כסנפשוט כדי שנוכל לחזור אחורה ולבנות את
הנתיב.

**Complexity / סיבוכיות**:
- Time:  O((N+M) · D)  where D = edit distance
- Space: O((N+M) · D)  (snapshot trace — acceptable for documents under ~100k lines)

Equality is defined by strict `===` on array elements, so the SAME core
routine handles line diff, word diff, and character diff without
specialisation.

---

## 4. 3-way merge rules / כללי מיזוג תלת-צדדי

Input: `base`, `branchA`, `branchB`. We produce two line-level diffs
(`base→A` and `base→B`) and classify every `base` line into a slot:

| Slot A                | Slot B                | Outcome / תוצאה                                        |
|-----------------------|-----------------------|---------------------------------------------------------|
| `keep`                | `keep`                | כך הבסיס נשמר / keep base                              |
| `delete`              | `delete`              | שני צדדים מחקו / drop cleanly                          |
| `keep`                | `delete`              | רק B מחק / take B's delete                             |
| `delete`              | `keep`                | רק A מחק / take A's delete                             |
| `keep`                | `replace`             | רק B שינה / take B's replacement                       |
| `replace`             | `keep`                | רק A שינה / take A's replacement                       |
| `replace` = `replace` | (identical lines)     | מיזוג נקי / take once                                  |
| `replace` ≠ `replace` | (different lines)     | **התנגשות / CONFLICT**                                 |
| `delete`              | `replace`             | **התנגשות** (delete-vs-modify)                         |
| `replace`             | `delete`              | **התנגשות** (modify-vs-delete)                         |

Inserts that appear *between* base lines are bucketed by their base-offset
and merged when they match, concatenated when only one side added, and
flagged as a conflict when both sides added different content at the same
offset.

### Conflict marker format / פורמט סימוני התנגשות

```
<<<<<<< Branch A
...lines from branch A...
||||||| Base
...original base lines...
=======
...lines from branch B...
>>>>>>> Branch B
```

The Hebrew-localised labels are available in `LABELS.conflictStart` /
`conflictBase` / `conflictMid` / `conflictEnd` so editors can re-render the
markers in Hebrew when desired.

---

## 5. Output formats / פורמטי פלט

| Method            | Format                                      | Bilingual? | Use case                                  |
|-------------------|---------------------------------------------|:----------:|-------------------------------------------|
| `formatHTML`      | RTL `<div dir="rtl">` + `<ins>` / `<del>`   | Yes        | Browser-embedded review UIs               |
| `formatMarkdown`  | `` ```diff `` block with `+++` / `---`      | Yes (note) | PR descriptions, wiki pages, email        |
| `formatUnified`   | Classic `@@ -a,b +c,d @@` unified diff      | —          | CLI review, patch tooling, git pipes      |

- **HTML** — every field is run through `escapeHtml` before concatenation;
  the `<ins>` / `<del>` tags carry bilingual `title` attributes so hover
  tooltips read *נוסף / Inserted* and *נמחק / Deleted*. `dir="rtl"` and
  `lang="he"` are set on the container so browsers handle Hebrew properly.
- **Markdown** — wraps the body in a bilingual HTML comment header plus a
  `diff` fenced block, so GitHub-flavoured Markdown highlights it.
- **Unified** — one `@@` header per hunk, with `contextLines` tuneable
  (default 3). Suitable for piping into `git apply --check`.

---

## 6. Similarity score / ציון דמיון

Formula:

```
distance = Levenshtein(A, B)  // over Hebrew-safe grapheme clusters
score    = 1 - distance / max(len(A), len(B))
```

- Levenshtein uses Wagner-Fischer DP with **O(min(n,m))** memory by
  swapping rows.
- Both inputs are first converted to grapheme clusters via `splitChars`,
  so nikkud on ב doesn't inflate the edit distance.
- Two empty strings yield `1` (identical). One empty string and any
  non-empty yields `0`.
- Result is rounded to 4 decimals for cross-platform determinism.

### Known canonical cases
| A          | B          | distance | score   |
|------------|------------|---------:|--------:|
| `kitten`   | `sitting`  |        3 |  0.5714 |
| `abcdef`   | `abcdef`   |        0 |  1.0000 |
| `aaaa`     | `bbbb`     |        4 |  0.0000 |
| `חוזה`     | `חוזה`     |        0 |  1.0000 |

---

## 7. Test inventory / רשימת בדיקות

Run with `node --test test/docs/doc-diff.test.js`. **37 tests, all green.**

### Section A — Myers correctness (6)
- A1 identical inputs
- A2 empty vs non-empty
- A3 non-empty vs empty
- A4 single line change
- A5 Myers minimality: single-line mid-insert = 1 op
- A6 CRLF ↔ LF normalisation

### Section B — Word-level diff (2)
- B1 single replaced word
- B2 whitespace runs preserved

### Section C — Char-level / Hebrew safety (4)
- C1 nikkud glued to base letter
- C2 final letters vs medial are distinct graphemes
- C3 mixed Hebrew + English + digits
- C4 pure Hebrew line round-trip

### Section D — Section diff (2)
- D1 markdown headers
- D2 whole-section insert + delete reporting

### Section E — Patch / reverse patch (4)
- E1 ASCII round-trip
- E2 reverse patch reproduces A
- E3 structural guard throws on bad A
- E4 Hebrew round-trip

### Section F — 3-way merge (5)
- F1 clean merge (one branch changes)
- F2 clean merge (disjoint edits)
- F3 conflict (same line, different edits)
- F4 Hebrew conflict preservation
- F5 identical edits on both sides → clean

### Section G — Formatters (4)
- G1 HTML escapes `<script>`; RTL attrs present
- G2 HTML uses `<ins>` / `<del>`
- G3 Markdown `+++` / `---` prefixes
- G4 Unified `@@` header + sign prefixes

### Section H — Summary + similarity (6)
- H1 counts insertions / deletions / unchanged
- H2 identical → 0 % changed
- H3 similarity = 1 for identical (incl. Hebrew, incl. empty)
- H4 similarity = 0 for fully disjoint
- H5 `kitten`↔`sitting` ≈ 0.5714
- H6 Hebrew symmetry + bounds

### Section I — Safety (2)
- I1 OWASP base-5 HTML escape
- I2 empty line safe in HTML formatter

### Section J — Static facade (2)
- J1 `DocDiff.diffLines` == `new DocDiff().diffLines`
- J2 `DIFF_OPS` frozen + bilingual

---

## 8. Hebrew glossary / מילון מונחים

| Hebrew             | English                  | Notes                                               |
|--------------------|--------------------------|-----------------------------------------------------|
| ניקוד              | Nikkud                   | Vocalisation marks U+0591..U+05C7                   |
| דגש                | Dagesh                   | U+05BC — gemination/plosive marker                  |
| אותיות סופיות      | Final letters            | ך ם ן ף ץ — distinct graphemes from medial forms    |
| חוזה               | Contract                 | Primary document class for redline reviews         |
| מדיניות            | Policy                   | Bilingual change tracking for compliance           |
| נוהל עבודה         | Procedure                | Step-by-step instructions; section-diff target     |
| מזכר               | Memo                     | Short internal note                                |
| חומר שיווקי        | Marketing collateral     | Often mixes Hebrew + English + brand tokens        |
| סניף               | Branch                   | 3-way merge participant                            |
| בסיס משותף         | Common base              | The `base` input to 3-way merge                    |
| התנגשות            | Conflict                 | Emitted when both branches mutate the same line    |
| מיזוג              | Merge                    | Output of `mergeThreeWay`                          |
| שורה               | Line                     | Primary diff unit                                  |
| מילה               | Word                     | Word-level diff unit (non-whitespace token)        |
| תו                 | Character                | Grapheme-cluster diff unit                         |
| סעיף               | Section                  | Header-delimited block in `diffSections`           |
| השוואה             | Comparison / diff        | Generic term for the entire module                 |
| דמיון              | Similarity               | Output of `similarityScore`                        |
| תיקון              | Patch                    | Result of `patch` / `reversePatch`                 |
| ללא שינוי          | Unchanged                | `equal` operation                                  |
| נוסף               | Inserted                 | `insert` operation                                 |
| נמחק               | Deleted                  | `delete` operation (descriptive only)              |

---

## 9. Integration notes / הערות אינטגרציה

- **Paired with**: Agent Y-106 (`doc-version-control.js`) — once two
  revisions exist in the version control store, pass their `body` strings
  to `DocDiff.diffLines` and render the result with `formatHTML` into the
  contracts / marketing / policy review UI.
- **Procurement quotes** — use `similarityScore` on successive drafts of a
  quote body to detect "silent edits" before sending to a customer.
- **Approval workflow** — attach `DocDiff.summary(diff)` to any approval
  request so approvers see `{insertions, deletions, percentChanged}` in
  the request card.
- **Audit trail** — store the diff `hunks` from `mergeThreeWay` on every
  merge commit so legal can replay the conflict resolution.
- **Zero-dep** — this module is safe to load from the web tier, the CLI,
  the cron jobs, and the chatbot without any extra install step.

---

## 10. Known limitations / מגבלות ידועות

1. Myers is O((N+M)·D) in both time and memory due to snapshot traces.
   Documents above ~100k lines with high edit distance should first be
   segmented by `diffSections` and diffed per-section.
2. Character-level diff treats `U+0591..U+05C7` and `U+FB1E` as Hebrew
   combining marks. General Unicode cluster rules (e.g. emoji ZWJ
   sequences) are *not* handled — that is out of scope for office docs.
3. `mergeThreeWay` operates at line granularity. Word-level conflict
   resolution inside a single line is **not** attempted; the whole line
   becomes a conflict. This matches Git's default behaviour and keeps
   the legal audit trail unambiguous.
4. Unified diff line numbers are derived from `aIdx` / `bIdx` markers
   that the Myers routine emits. If a caller passes a diff that was
   hand-constructed without those indices, `formatUnified` silently
   falls back to 0-based numbering.

---

## 11. Sign-off / אישור

- ✓  `לא מוחקים רק משדרגים ומגדלים` respected
- ✓  Zero external dependencies (only `node:test` + `node:assert`)
- ✓  Hebrew RTL + bilingual labels on every public structure
- ✓  HTML output XSS-safe (OWASP base-5 escape)
- ✓  37/37 tests green (`node --test test/docs/doc-diff.test.js`)
- ✓  Myers diff correctness, word/char/section levels, 3-way merge with
     Hebrew conflicts, patch round-trip, reverse patch, similarity score,
     safe HTML escape — all covered
