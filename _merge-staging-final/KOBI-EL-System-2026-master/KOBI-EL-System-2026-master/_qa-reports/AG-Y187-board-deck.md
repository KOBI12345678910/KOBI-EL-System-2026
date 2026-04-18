# AG-Y187 — Board Deck Generator / מחולל מצגת דירקטוריון

**Agent:** Y-187 (Board Deck Generator)
**System:** Techno-Kol Uzi mega-ERP
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 17 / 17 tests passing
**Rule / כלל:** לא מוחקים רק משדרגים ומגדלים (Never delete, only upgrade & grow)

---

## 1. Mission / משימה

**EN —** Build a zero-dependency quarterly board deck generator for
Techno-Kol Uzi that turns aggregated KPI data into a single self-contained
bilingual HTML slide deck. The deck must render correctly RTL for the Hebrew
audience and LTR for the English audience, share a Palantir-dark visual
identity, and be serializable to a standalone file with inline CSS only —
no external fonts, images, stylesheets, or scripts. It sits under
`onyx-procurement/src/reporting/` alongside other cross-module reporting
engines so that the quarterly board pack can be produced from the same
pipeline that feeds the grand aggregator and management dashboards.

**HE —** לבנות מחולל מצגת דירקטוריון רבעוני נטול תלויות עבור טכנו-קול עוזי
אשר הופך נתוני KPI מאוחדים למצגת HTML דו-לשונית אחת המוכלת בעצמה. המצגת
חייבת להיפרש נכון RTL עבור הקהל העברי ו-LTR עבור הקהל האנגלי, לשאת את
זהות המותג הכהה בסגנון פלנטיר, ולהיות ניתנת לשמירה כקובץ עצמאי עם CSS
מוטבע בלבד — ללא פונטים חיצוניים, תמונות, סגנונות או סקריפטים. המודול
ממוקם ב-`onyx-procurement/src/reporting/` לצד מנועי דיווח חוצי-מערכת אחרים
כך שערכת הדירקטוריון הרבעונית מיוצרת מאותו צינור שמזין את אגרגטור-האב
ודשבורדי ההנהלה.

---

## 2. Deliverables / תוצרים

| # | File | Purpose |
|---|------|---------|
| 1 | `onyx-procurement/src/reporting/board-deck.js` | Generator — `BoardDeck` class, HTML renderer, helpers, inline CSS |
| 2 | `onyx-procurement/test/reporting/board-deck.test.js` | 17 unit tests via `node:test` |
| 3 | `_qa-reports/AG-Y187-board-deck.md` | This bilingual report |

**Zero runtime dependencies / אפס תלויות זמן-ריצה.** Only `node:fs` and
`node:path` are required. Nothing existing was deleted or overwritten.

---

## 3. Public API / ממשק ציבורי

```js
const {
  BoardDeck,          // class — builder for the slide deck
  generateBoardDeck,  // one-shot helper — accepts a payload
  PALETTE,            // frozen palette constants
  SLIDE_ORDER,        // canonical list of 11 slide keys
  DEFAULT_TITLES,     // bilingual default titles per slide
} = require('./reporting/board-deck');

const deck = new BoardDeck({
  company: 'טכנו-קול עוזי בע"מ',
  quarter: 'Q1 2026',
  fiscalYear: '2026',
  preparedBy: 'Kobi El-Roi',
  meetingDate: '2026-04-15',
  confidential: true,
});

deck.setExecutiveSummary({
  en: ['Revenue up 12% YoY', 'Cash runway extended to 18 months'],
  he: ['הכנסות עלו ב-12% שנה על שנה', 'רזרבת מזומנים הוארכה ל-18 חודשים'],
});

deck.setFinancialHighlights({
  metricsEn: [
    { label: 'Revenue',      value: '₪ 48.2M', delta: '+12%',    trend: 'up'   },
    { label: 'Gross Margin', value: '34.6%',   delta: '+210bps', trend: 'up'   },
    { label: 'EBITDA',       value: '₪ 6.4M',  delta: '-3%',     trend: 'down' },
  ],
  metricsHe: [
    { label: 'הכנסות',     value: '₪ 48.2מ', delta: '+12%', trend: 'up' },
    { label: 'רווח גולמי', value: '34.6%',   delta: '+210נ"ב', trend: 'up' },
    { label: 'EBITDA',     value: '₪ 6.4מ',  delta: '-3%',  trend: 'down' },
  ],
});

const { path, size } = deck.writeToFile('out/board-q1-2026.html');
```

### Setter methods / שיטות שמירה

Every standard slide has a dedicated setter that returns `this` for
chaining:

| Method | Slide |
|---|---|
| `setTitle`                | title / שער |
| `setAgenda`               | agenda / סדר יום |
| `setExecutiveSummary`     | executive summary / תקציר מנהלים |
| `setFinancialHighlights`  | financial highlights / נקודות פיננסיות |
| `setOperatingMetrics`     | operating metrics / מדדי תפעול |
| `setCustomerMetrics`      | customer metrics / מדדי לקוחות |
| `setSafetyCompliance`     | safety & compliance / בטיחות ואמנה |
| `setPipelineBacklog`      | pipeline & backlog / צבר הזמנות וצנרת |
| `setStrategicInitiatives` | strategic initiatives / יוזמות אסטרטגיות |
| `setRisksMitigations`     | risks & mitigations / סיכונים ומיטיגציות |
| `setAsksForBoard`         | asks for the board / בקשות לדירקטוריון |

Use `deck.loadAggregated(payload)` to populate the entire deck in one call
from an aggregated KPI object. Unknown keys are never dropped — they are
queued into `customSections` and rendered at the end with a mirror-pair
wrapper.

---

## 4. Slide Catalog / קטלוג שקפים

**11 canonical slides × 2 languages = 22 `<section>` elements.**

| # | Key | EN Title | כותרת עברית |
|---|---|---|---|
| 1  | title                | Quarterly Board Meeting | דירקטוריון רבעוני |
| 2  | agenda               | Agenda                  | סדר יום |
| 3  | executiveSummary     | Executive Summary       | תקציר מנהלים |
| 4  | financialHighlights  | Financial Highlights    | נקודות פיננסיות |
| 5  | operatingMetrics     | Operating Metrics       | מדדי תפעול |
| 6  | customerMetrics      | Customer Metrics        | מדדי לקוחות |
| 7  | safetyCompliance     | Safety & Compliance     | בטיחות ואמנה |
| 8  | pipelineBacklog      | Pipeline & Backlog      | צבר הזמנות וצנרת |
| 9  | strategicInitiatives | Strategic Initiatives   | יוזמות אסטרטגיות |
| 10 | risksMitigations     | Risks & Mitigations     | סיכונים ומיטיגציות |
| 11 | asksForBoard         | Asks for the Board      | בקשות לדירקטוריון |

---

## 5. Mirror-Pair Pattern / תבנית הזוגות המקבילים

**EN —** For every canonical slide the generator emits **two siblings**
inside a `<div class="slide-pair">` wrapper:

```
<div class="slide-pair" data-slide="executiveSummary">
  <section class="slide slide-executiveSummary slide-en" dir="ltr" lang="en">...</section>
  <section class="slide slide-executiveSummary slide-he" dir="rtl" lang="he">...</section>
</div>
```

The English slide is always first so that the document's own `<html lang="en" dir="ltr">`
root is satisfied without overriding per-element directionality. CSS uses a
two-column grid on wide screens and collapses to a single column below
900 px so that print and projector layouts stay legible.

**HE —** עבור כל שקף קנוני המחולל מוציא **שני אחים** בתוך עטיפת
`<div class="slide-pair">`. השקף האנגלי מופיע ראשון כך ששורש המסמך
`<html lang="en" dir="ltr">` מרוצה מבלי לעקוף את כיווניות הרמה האלמנטית.
ה-CSS משתמש ברשת דו-טורית במסכים רחבים ומתקפלת לטור יחיד מתחת ל-900 פיקסלים
כך שפריסות ההדפסה והמקרן נשמרות קריאות.

---

## 6. Visual Identity / זהות ויזואלית

Palantir-dark palette, captured in the frozen `PALETTE` export and mirrored
into CSS custom properties:

| Token | Hex | Role |
|---|---|---|
| `--bg`        | `#0b0d10` | Page background |
| `--panel`     | `#13171c` | Slide panel |
| `--panel-alt` | `#181d24` | Metric card fill |
| `--border`    | `#23303f` | Slide border |
| `--accent`    | `#4a9eff` | Slide headers, title border |
| `--accent-soft` | `#2b6bb3` | Title slide gradient edge |
| `--text`      | `#e6edf3` | Body text |
| `--text-muted`| `#8a97a8` | Labels, meta lines |
| `--danger`    | `#ff5d5d` | Negative deltas, high-severity risks |
| `--warn`      | `#f2c14e` | Medium-severity risks, CONFIDENTIAL |
| `--ok`        | `#38d39f` | Positive deltas, low-severity risks |

Print CSS switches background to white and borders to grey so the deck can
be exported to PDF without burning ink.

---

## 7. Test Matrix / מטריצת בדיקות (17 tests)

| # | Test | What it proves |
|---|---|---|
| 1  | exports surface                               | Class + helper functions + constants are exported |
| 2  | constructor defaults                          | Options captured, confidential defaults to `true` |
| 3  | render returns HTML5 document                 | Starts with doctype, has html/head/body/style |
| 4  | all 11 canonical slides present               | Each slide key in `SLIDE_ORDER` is rendered |
| 5  | mirror-pair pattern                           | EN count === HE count, >= 11 pairs |
| 6  | Hebrew slides RTL                             | `dir="rtl" lang="he"` per Hebrew section |
| 7  | English slides LTR                            | `dir="ltr" lang="en"` per English section |
| 8  | Palantir-dark palette                         | #0b0d10, #13171c, #4a9eff in inline CSS |
| 9  | executive summary bilingual                   | EN + HE bullets round-trip through render |
| 10 | financial metric cards                        | metric-card/label/value and delta up/down classes |
| 11 | risk severity classes                         | risk-high / risk-med / risk-low emitted |
| 12 | pipeline table                                | `<table class="board-table">` with headers + rows |
| 13 | HTML escaping                                 | `<script>`, `&`, `"`, `<` all escaped |
| 14 | custom sections                               | Unknown keys queued and rendered at the end |
| 15 | writeToFile persists self-contained HTML      | File exists, > 2kb, no external css/js/img |
| 16 | generateBoardDeck helper                      | Both in-memory and write-to-disk modes |
| 17 | confidential footer toggle                    | `confidential: false` hides the ribbon |

### Run / הרצה

```
cd onyx-procurement
node --test test/reporting/board-deck.test.js
```

### Result / תוצאה

```
tests 17
pass  17
fail  0
```

---

## 8. Security Notes / הערות אבטחה

- **XSS hardening / חיסון XSS:** Every user-supplied string passes through
  `escapeHtml`, covering `&`, `<`, `>`, `"`, and `'`. Test #13 asserts that a
  `<script>alert(1)</script>` payload is rendered as literal text.
- **Self-contained output / פלט עצמאי:** The deck has zero external
  resources — no `<link rel="stylesheet">`, no remote `<script src>`, no
  `<img src="http...">`. A board member can open the file air-gapped.
- **Confidential ribbon / סרט סודיות:** Enabled by default and printed in
  the footer in both languages ("CONFIDENTIAL / סודי"). Can be disabled per
  deck via `{ confidential: false }` for non-sensitive audiences.
- **Never-delete / לא-מוחקים:** Unknown payload keys are never dropped; they
  are appended as "custom" mirror pairs so ad-hoc KPIs still reach the deck.

---

## 9. Integration Notes / הערות אינטגרציה

**EN —** The generator is intentionally a pure renderer. It has no HTTP
surface, no DB access, and no logging side-effects. The calling service
(scheduled job / grand aggregator / CLI) is responsible for assembling the
aggregated payload and handing it to `BoardDeck.loadAggregated`. Because
only Node built-ins are used, the module also runs cleanly inside worker
threads and offline build steps.

**HE —** המחולל הוא רכיב רינדור טהור במכוון. אין לו שטח פנים HTTP, אין לו
גישת מסד נתונים ואין לו תופעות לוואי ליומני מערכת. שירות הקריאה (משימה
מתוזמנת / אגרגטור אב / CLI) אחראי להרכיב את מטען הנתונים המאוחד ולמסור אותו
ל-`BoardDeck.loadAggregated`. מאחר שנעשה שימוש אך ורק במודולים מובנים של
Node, המודול רץ נקי גם בתוך Worker Threads ושלבי build במצב לא-מקוון.

---

## 10. Verdict / פסק דין

**STATUS:** GREEN — Production ready.
**סטטוס:** ירוק — מוכן ליצור.

Total files touched: 3 (all new). No deletions. No modifications to existing
code. 17/17 tests pass. Satisfies the Y-187 spec: BoardDeck class, 11
standard slides, bilingual RTL/LTR mirror-pair pattern, Palantir-dark
inline CSS, zero runtime dependencies.
