# AG-Y026 — Competitor Intelligence Tracker

**Module:** `onyx-procurement/src/sales/competitor-tracker.js`
**Tests:** `onyx-procurement/test/sales/competitor-tracker.test.js`
**Status:** GREEN — 15/15 tests passing
**Date built:** 2026-04-11
**Governance rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade and grow
**Dependencies:** zero (pure Node.js / CommonJS)
**Runtime:** Node.js `node:test` + `node:assert/strict`

---

## 1. Purpose

The CompetitorTracker is a deterministic, append-only, bilingual (Hebrew-RTL
and English-LTR) competitive-intelligence engine for the Techno-Kol Uzi
sales team operating in Israel. It captures competitor profiles, every deal
in which a competitor appeared, intel signals over time, and automatically
synthesizes battlecards and SWOT analyses.

Three invariants are enforced at the API layer:

1. **Never delete.** Every update is additive. Competitor profile upgrades
   push the prior snapshot into `history[]` and bump `version`.
2. **Append-only storage.** Encounters and intel entries have unique IDs and
   can never be rewritten in place.
3. **Bilingual by construction.** Every user-facing output ships a `he`
   (RTL) block and an `en` (LTR) block. String summaries are normalized to
   `{he, en}` pairs before storage.

---

## 2. Public API

```js
const { CompetitorTracker, OUTCOMES, INTEL_CATEGORIES } =
  require('./src/sales/competitor-tracker.js');

const tracker = new CompetitorTracker();
```

| Method | Signature | Returns |
|---|---|---|
| `defineCompetitor(profile)` | `{id, name, website?, country?, size?, segments?, strengths?, weaknesses?, pricingModel?, features?, priceBands?, positioning?, objectionHandlers?, proofPoints?, trapQuestions?}` | stored record (clone) |
| `recordEncounter(opportunityId, competitorId, outcome, notes?)` | `outcome` in `won \| lost \| tie \| withdrew \| no_decision` | encounter entry |
| `winRateVsCompetitor(competitorId)` | — | `{total, won, lost, tie, withdrew, noDecision, decisive, winRate, winRatePct}` |
| `getBattlecard(competitorId)` | — | bilingual battlecard object |
| `updateIntel(competitorId, intel)` | `{category, summary, source?, url?, delta?}` | intel entry |
| `listActiveCompetitors(segment?)` | — | array sorted by `lastActivityAt` |
| `generateSWOT(competitorId)` | — | bilingual SWOT object |
| `getCompetitor(id)` / `listCompetitors()` | — | clone(s) |
| `listEncounters(competitorId?)` / `listIntel(competitorId)` | — | array of clones |
| `getAuditLog()` / `getStats()` | — | diagnostics |

All read paths return deep clones — caller mutation never corrupts storage.

---

## 3. Data Model

### 3.1 Competitor record

```text
{
  id:            string            // stable key
  name:          string
  website:       string
  country:       string            // e.g. "IL"
  size:          micro|small|medium|large|enterprise
  segments:      string[]          // e.g. ["procurement","finance"]
  strengths:     string[]
  weaknesses:    string[]
  pricingModel:  string            // e.g. "Per-user annual"
  features:      { [name]: { us, them, advantage: us|them|tie } }
  priceBands:    { [tier]: { us, them, currency } }
  positioning:   { he, en } | null
  objectionHandlers: [{ objection:{he,en}, handler:{he,en} }]
  proofPoints:   [{ he, en }]
  trapQuestions: [{ he, en }]
  createdAt:     ISO timestamp
  updatedAt:     ISO timestamp
  version:       integer (monotonic)
  history:       [previous snapshots]   // never pruned
}
```

### 3.2 Encounter record

```text
{
  id:            "enc_<n>_<epochMs>"
  opportunityId: string
  competitorId:  string
  outcome:       won|lost|tie|withdrew|no_decision
  notes:         string
  recordedAt:    ISO timestamp
}
```

### 3.3 Intel entry

```text
{
  id:        "intel_<n>_<epochMs>"
  category:  news|pricing_change|product_launch|leadership|funding|
             layoff|acquisition|partnership|customer_win|customer_loss|
             legal|other
  summary:   { he, en }                  // always normalized
  source:    string
  url:       string
  delta:     null | {
    pricingModel?, priceBands?, features?, strengths?, weaknesses?,
    segments?, positioning?, objectionHandlers?, proofPoints?, trapQuestions?
  }
  at:        ISO timestamp
}
```

### 3.4 Battlecard output

```text
{
  competitorId, name, version, generatedAt,
  metadata: { website, country, size, sizeLabel, segments,
              pricingModel, lastUpdated },
  labels: BILINGUAL_LABELS,
  winStats: winRateVsCompetitor(...),
  featureComparison: [{feature, us, them, advantage}],
  priceComparison:   [{tier, us, them, currency, delta}],
  positioning:       {he, en},
  objectionHandlers: [{objection:{he,en}, handler:{he,en}}],
  proofPoints:       [{he, en}],
  trapQuestions:     [{he, en}],
  recentIntel:       [last 5 intel entries],
  he: { dir:"rtl", lang:"he", title, sections: {...} },
  en: { dir:"ltr", lang:"en", title, sections: {...} }
}
```

### 3.5 SWOT output

```text
{
  competitorId, name, generatedAt,
  score:    integer in [-100, 100]   // positive = we dominate
  summary:  { he, en },
  raw: {
    strengths:[{he,en}], weaknesses:[{he,en}],
    opportunities:[{he,en}], threats:[{he,en}],
    categoryCounts: { [intelCategory]: count },
    winStats:      winRateVsCompetitor(...)
  },
  he: { dir:"rtl", lang:"he", title, strengths[], weaknesses[],
        opportunities[], threats[], summary },
  en: { dir:"ltr", lang:"en", title, strengths[], weaknesses[],
        opportunities[], threats[], summary }
}
```

---

## 4. Battlecard Template (rendering guidance)

Render HE side with `dir="rtl"`, EN side with `dir="ltr"`. The labels are
machine-readable via the `labels` field — do not hardcode section names in
the UI layer; drive them from `battlecard.labels.*.he / .en`.

### 4.1 Hebrew (RTL) template

```text
┌─────────────────────────────────────────────────┐
│  כרטיס קרב: {name}                              │
│─────────────────────────────────────────────────│
│  סקירה כללית                                     │
│    מדינה:          {country}                     │
│    גודל:           {sizeLabel.he}                │
│    מגזרים:          {segments}                    │
│    מודל תמחור:     {pricingModel}                │
│    אתר אינטרנט:    {website}                     │
│    עודכן לאחרונה:  {updatedAt}                   │
│─────────────────────────────────────────────────│
│  חוזקות          |  חולשות                       │
│  • …             |  • …                          │
│─────────────────────────────────────────────────│
│  השוואת תכונות                                    │
│    {feature}  | שלנו:{us} | שלהם:{them} | יתרון  │
│─────────────────────────────────────────────────│
│  השוואת מחירים                                    │
│    {tier}     | שלנו:{us} | שלהם:{them} | Δ%    │
│─────────────────────────────────────────────────│
│  הצהרת מיצוב                                      │
│    {positioning.he}                              │
│─────────────────────────────────────────────────│
│  מענה להתנגדויות                                  │
│    התנגדות: …                                    │
│    מענה: …                                        │
│─────────────────────────────────────────────────│
│  נקודות הוכחה                                     │
│    • …                                            │
│─────────────────────────────────────────────────│
│  שאלות מלכודת                                     │
│    ? …                                            │
│─────────────────────────────────────────────────│
│  מודיעין אחרון                                     │
│    [category] — {summary.he}                     │
│─────────────────────────────────────────────────│
│  שיעור ניצחון: {pct}% ({won}/{decisive})        │
└─────────────────────────────────────────────────┘
```

### 4.2 English (LTR) template

Same skeleton as above with labels from `BILINGUAL_LABELS.*.en`.

### 4.3 Default content

If `positioning`, `objectionHandlers`, `proofPoints`, or `trapQuestions` are
not supplied on the competitor record, the tracker injects sensible defaults
keyed to the Israeli market (Hebrew-speaking TCO framing, local-support
proof, Israeli-tax-reporting trap question). Downstream UI can detect
defaults by diffing against `rec.positioning === null`.

---

## 5. Hebrew Glossary

| Hebrew | Transliteration | English |
|---|---|---|
| מתחרה | mit'chare | competitor |
| כרטיס קרב | kartis krav | battlecard |
| סקירה כללית | skira klalit | overview |
| חוזקות | chozkot | strengths |
| חולשות | chulshot | weaknesses |
| השוואת תכונות | hashvaat tchunot | feature comparison |
| השוואת מחירים | hashvaat mechirim | price comparison |
| הצהרת מיצוב | hatzharat mitzuv | positioning statement |
| מענה להתנגדויות | maane lehitnagduyot | objection handlers |
| נקודות הוכחה | nekudot hochacha | proof points |
| שאלות מלכודת | sheelot malkodet | trap questions |
| ניתוח SWOT | nitu'ach SWOT | SWOT analysis |
| הזדמנויות | hizdamnuyot | opportunities |
| איומים | iyumim | threats |
| שיעור ניצחון | shiur nitzachon | win rate |
| מפגשים | mifgashim | encounters |
| מודל תמחור | model timchur | pricing model |
| מגזרים | migzarim | segments |
| עודכן לאחרונה | udkan leacharona | last updated |
| מודיעין | modi'in | intelligence / intel |
| עסקה | iska | deal / opportunity |
| ניצחנו | nitzachnu | we won |
| הפסדנו | hifsadnu | we lost |
| תיקו | teiko | tie |
| נסוג | nasog | withdrew |
| ללא החלטה | lelo hachlata | no decision |
| גיוס הון | giyus hon | funding |
| פיטורים | piturim | layoffs |
| רכישה | rechisha | acquisition |
| שותפות | shutafut | partnership |
| השקת מוצר | hashakat mutzar | product launch |
| שינוי תמחור | shinui timchur | pricing change |
| זעיר / קטן / בינוני / גדול / ארגוני | — | micro/small/medium/large/enterprise |

All strings are shipped inside `CompetitorTracker.BILINGUAL_LABELS` so UI
code can drive locale switching without maintaining its own catalog.

---

## 6. Algorithms

### 6.1 Win rate

```text
decisive = won + lost
winRate  = decisive == 0 ? 0 : won / decisive
winRatePct = round(winRate * 100, 1)
```

Ties, `withdrew`, and `no_decision` are tracked but excluded from the
ratio. They are reported separately so the salesperson can still see the
full volume of activity against a competitor.

### 6.2 SWOT auto-generation

Buckets are populated from:

- **Strengths (theirs):** `rec.strengths[]`, plus automatic adds for
  `size in {large, enterprise}` and `segments.length >= 3`.
- **Weaknesses (theirs):** `rec.weaknesses[]`, plus auto adds when our
  decisive win rate ≥ 60% over ≥ 3 deals, and when `pricingModel` is
  empty (no public transparency).
- **Opportunities (for us):** derived from intel category counts:
  `layoff`, `customer_loss`, `pricing_change`, plus positive win-rate
  signal (≥ 50% over ≥ 3 deals).
- **Threats (to us):** from `funding`, `product_launch`, `acquisition`,
  `customer_win`, plus negative win-rate signal (< 40% over ≥ 3 deals).

**Score:**

```text
score = strengths*-5  +  weaknesses*5  +  opportunities*8  +  threats*-8
score = clamp(score, -100, 100)
```

Interpretation thresholds:

| Score band | HE summary | EN summary |
|---|---|---|
| score > 20 | מצב תחרותי חיובי — להמשיך בלחץ מכירתי ישיר. | Favorable competitive posture — press direct sales pressure. |
| -20…20 | מצב תחרותי מאוזן — לבחור מגרשים סלקטיביים. | Balanced competitive posture — choose battles selectively. |
| score < -20 | מצב תחרותי קשה — נדרשת דיפרנציאציה או נישה חדשה. | Tough competitive posture — differentiate or pick a new niche. |

### 6.3 Active competitor filter

A competitor is **active** if (a) it has ≥ 1 encounter or ≥ 1 intel entry,
AND (b) that latest activity is within the last 365 days. Inactive
competitors are NEVER deleted — only hidden from this list.

---

## 7. Test coverage

15 tests — all green.

| # | Test | Surface covered |
|---|---|---|
| 1 | defineCompetitor stores a record with version=1 | baseline creation |
| 2 | defineCompetitor upgrades existing, preserves history | upgrade-not-delete rule |
| 3 | defineCompetitor throws on missing id/name | validation |
| 4 | recordEncounter stores opp + auto-creates stub competitor | non-destructive auto-create |
| 5 | recordEncounter rejects invalid outcome | validation |
| 6 | winRateVsCompetitor computes 60% over 5 decisive deals | win rate math |
| 7 | winRateVsCompetitor returns 0 when no decisive encounters | edge case |
| 8 | getBattlecard returns bilingual HE+EN with all required sections | battlecard generation |
| 9 | getBattlecard custom positioning overrides defaults | config override |
| 10 | updateIntel appends entries, preserves history, bumps version | intel append + history |
| 11 | updateIntel throws on unknown competitor | validation |
| 12 | updateIntel throws on missing category or summary | validation |
| 13 | listActiveCompetitors filters by segment and recency | roster query |
| 14 | generateSWOT produces bilingual SWOT with all four quadrants | SWOT auto-generation |
| 15 | no delete — every mutation is additive / upgradable | governance rule |

### Run command

```bash
cd onyx-procurement
node --test test/sales/competitor-tracker.test.js
```

### Expected output

```text
✔ defineCompetitor stores a record with version=1
✔ defineCompetitor upgrades existing competitor, preserves old in history
✔ defineCompetitor throws on missing id or name
✔ recordEncounter stores opportunity + auto-creates stub competitor
✔ recordEncounter rejects invalid outcome
✔ winRateVsCompetitor computes 60% over 5 decisive deals
✔ winRateVsCompetitor returns 0 when no decisive encounters
✔ getBattlecard returns bilingual HE+EN with all required sections
✔ getBattlecard custom positioning overrides defaults
✔ updateIntel appends entries, preserves history, bumps version
✔ updateIntel throws on unknown competitor
✔ updateIntel throws on missing category or summary
✔ listActiveCompetitors filters by segment and recency
✔ generateSWOT produces bilingual SWOT with all four quadrants
✔ no delete — every mutation is additive / upgradable
ℹ tests 15   pass 15   fail 0
```

---

## 8. Non-destructive guarantees (audit)

- `defineCompetitor` on an existing id snapshots the previous record into
  `history[]` and increments `version`. No field is overwritten without a
  snapshot in the audit chain.
- `updateIntel` always **appends** to the intel list and also takes a
  snapshot of the competitor record before applying any structured
  `delta` patch. Any downstream consumer can replay history by walking
  `competitor.history[]` in version order.
- `recordEncounter` is append-only — encounters are stored in a flat
  array and have unique ids.
- `_auditLog` captures every public-API write (`defineCompetitor`,
  `recordEncounter`, `updateIntel`) with a timestamp and payload clone.
  Retrievable via `getAuditLog()`. Never truncated by the tracker.
- `listActiveCompetitors` is a **query**, not a prune: inactive
  competitors remain in storage and are still accessible via
  `getCompetitor(id)` and `listCompetitors()`.

This document itself follows the same rule — **it must never be deleted**.
Future revisions should append a changelog section at the bottom.

---

## 9. Integration notes

- **Zero dependencies.** Safe to import from any Node runtime ≥ 18.
- **CommonJS + default export.** Consumers can use either form:
  ```js
  const { CompetitorTracker } = require('./competitor-tracker.js');
  // or
  const CompetitorTracker = require('./competitor-tracker.js').default;
  ```
- **Deterministic clock hook.** Pass `new CompetitorTracker({ clock: () => '2026-04-11T00:00:00Z' })` in tests to freeze timestamps.
- **Persistence.** The tracker is stateful in memory. To persist to disk
  or SQL, serialize `listCompetitors()`, `listEncounters()`, and
  `listIntel(id)` per competitor — all three are JSON-safe clones.
- **Rendering RTL.** The `he.dir` field is `"rtl"` on every output. UI
  should respect it via `dir={bc.he.dir}` and mirror margins.

---

## 10. Future upgrades (never deletions)

Planned additive features — each should preserve the rule:

- `compareCompetitors(idA, idB)` side-by-side diff view
- `exportBattlecardHTML(id, lang)` self-contained printable HTML
- `importIntelFromCSV(path)` bulk intel append
- `trendWinRate(competitorId, sinceIso)` temporal slicing
- Persist `_encounters` and `_intel` to SQLite via optional adapter

Any new method added must return cloned data, never mutate in place, and
must append to `_auditLog`.

---

## Changelog

- **2026-04-11** — Initial build. 15 tests green. Zero deps. Bilingual HE/EN.
