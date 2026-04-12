# AG-Y029 — Account Assignment Engine / מנוע שיוך לקוחות

**Agent:** Y-029 — Swarm Sales-Ops
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/sales/account-assignment.js`
**Test:** `onyx-procurement/test/sales/account-assignment.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרה

When leads, prospects and existing customers flow into the mega-ERP
(from web forms, import CSVs, the CRM pipeline, or manual entry), each
account must be routed to a salesperson. This engine evaluates a
priority-ordered rule list against the account, picks a strategy, and
assigns — all in-memory, zero-dependency, deterministic.

Five strategies are supported:

| Strategy | Hebrew | When to use |
|---|---|---|
| `round-robin` | סבב הוגן | Fair rotation across a pool. Each rep gets an equal share. |
| `weighted` | הגרלה משוקללת | Probabilistic draw by configured weight. Ideal for ramping up new reps (0.1 weight) or biasing towards high performers. |
| `skill` | התאמת כישורים | Match account traits (industry, product, language) to rep skills / certifications. |
| `capacity` | עומס מאוזן | Assign to the rep with the lowest load-to-capacity ratio. |
| `account-owner` | שימור בעלים | Preserve the existing owner on returning customers — no surprise handoffs mid-relationship. |

Rules are evaluated in **priority order** (lowest number first). The
first rule whose matcher fits is the rule that runs — subsequent rules
are ignored for that account.

---

## 2. Public API — ממשק ציבורי

```
defineRule({priority, matcher:{industry,size,region,product}, strategy, pool?}) → ruleId
registerSalesperson(sp)                                                          → id
upsertSalesperson(sp)                                                            → id
listSalespeople()                                                                → Salesperson[]
listRules()                                                                      → Rule[]

assign(account)                                                                  → { assignee_id, rule_id, strategy, reason, reason_he, reason_en, ts, action }
reassign(accountId, newAssigneeId, reason)                                       → HistoryEntry
unassign(accountId, reason)                                                      → HistoryEntry
balanceLoad(salespeople?)                                                        → { moves[], before, after }
simulateAssignment(accounts)                                                     → { results[], loadDelta, warnings }

blacklist(salespersonId, accountId, reason)                                      → BlacklistEntry
isBlacklisted(salespersonId, accountId)                                          → boolean
listBlacklist()                                                                  → BlacklistEntry[]

getHistory(accountId)                                                            → HistoryEntry[]   (frozen, append-only)
listUnassigned()                                                                 → Account[]
listByAssignee(salespersonId)                                                    → Account[]
stats()                                                                          → { rules, salespeople, accounts, unassigned, assignments, reassignments, blacklist }
```

---

## 3. Domain Model — מודל נתונים

### 3.1 Account

```js
{
  id,                  // required, stringified
  name,
  industry,            // 'construction' | 'retail' | 'manufacturing' | …
  size,                // 'enterprise' | 'mid-market' | 'smb' | 'micro'
  region,              // 'north' | 'center' | 'south' | 'jerusalem' | …
  product,             // 'erp' | 'payroll' | 'procurement' | …
  currentOwner?,       // salesperson id, for existing customers
  traits?,             // string[]  — free tags used by skill strategy
  value?               // expected ARR — used for tie-breakers
}
```

### 3.2 Salesperson

```js
{
  id, name,
  skills,              // string[] — e.g. ['enterprise','hebrew','english']
  certifications,      // string[] — e.g. ['SAP-FI','Oracle-SCM']
  capacity,            // max accounts — used by capacity strategy
  load,                // current count — auto-incremented on assign
  weight,              // 0..1 — probability mass in weighted strategy
  active,              // boolean — false means "skip in all strategies"
  regions?             // string[] — optional territory filter
}
```

### 3.3 Rule

```js
{
  id,                  // auto-generated 'rule-N'
  priority,            // number — lower = higher priority
  matcher: {
    industry?,         // exact match OR array OR function(got, account) → bool
    size?,
    region?,
    product?
  },
  strategy,            // one of the 5 strategies
  pool?                // explicit salesperson id subset; omit to use all active reps
}
```

### 3.4 HistoryEntry (append-only, frozen)

```js
{
  account_id,
  assignee_id,         // null if unassigned
  previous_assignee_id,// null on first assignment
  strategy,            // 'round-robin' | 'weighted' | 'skill' | 'capacity' | 'account-owner' | null
  rule_id,             // null on manual reassign / unassign / blacklist
  reason,              // bilingual combined string "<he> | <en>"
  reason_he,
  reason_en,
  ts,                  // ISO timestamp
  action,              // 'assign' | 'reassign' | 'unassign' | 'blacklist'
  meta?                // e.g. blacklist records the salesperson_id here
}
```

Every entry is `Object.freeze()`-d on insert. Re-assignment pushes a
**new** row; the previous row is never overwritten or mutated.

---

## 4. Strategies in Detail — פירוט האסטרטגיות

### 4.1 round-robin — סבב הוגן

Sorts the pool by `id.localeCompare` for determinism, then walks a
per-rule cursor. Each rule has its **own** cursor, so a construction
rule with `[a,b]` and a default rule with `[b,c]` rotate
independently.

- Inactive reps are filtered out of the pool before the cursor walks.
- Blacklisted pairs (rep/account) are also filtered.
- Fairness test: 40 accounts / 4 reps → exactly 10 each (test #4).

### 4.2 weighted — הגרלה משוקללת

Probabilistic draw using a deterministic xorshift32 RNG, seeded per
instance (default `20260411`). Any rep with `weight <= 0` is treated
as weight 0. If **all** weights are zero, the first rep is returned
(defensive fallback).

- Empirical distribution test: 5000 draws with weights 0.7/0.2/0.1
  lands within ±5% of the configured ratios (test #6).
- Simulation fork uses `seed XOR 0xDEADBEEF` so a dry run doesn't
  consume the main cursor.

### 4.3 skill — התאמת כישורים

Trait vector =
`[…account.traits, industry, size, product]` lowercased. Rep bag =
`[…skills, …certifications]` lowercased. Hit score is the count of
overlapping terms. Ties are broken by `load` then `id`.

If the top score is zero (no trait match), the engine falls back to
`capacity` for that invocation — test #9 asserts this.

### 4.4 capacity — עומס מאוזן

Sorts by `load / capacity` ratio ascending. If
`allowOverCapacity === false` (default), reps already at or above
capacity are filtered out — the assign then returns `assignee_id: null`
with reason `no-rule` / `over-capacity` (test #11).

### 4.5 account-owner — שימור בעלים

Looks up `account.currentOwner`. If the owner exists, is active, is
not blacklisted, and is in the rule's pool, the owner wins. Otherwise
the engine falls through to the next rule (test #14).

---

## 5. Priority Rules — דירוג חוקים

Rules are sorted by `priority` ascending on every `defineRule` call.
The typical Israeli-ERP stack looks like:

```
priority=10   matcher={}                        strategy='account-owner'   // always respect existing owners first
priority=20   matcher={size:'enterprise'}       strategy='skill'           // enterprise needs certified reps
priority=30   matcher={region:'north'}          strategy='round-robin'     // northern territory
priority=40   matcher={region:'south'}          strategy='round-robin'
priority=50   matcher={size:'micro'}            strategy='weighted'        // ramp junior reps via low-touch accounts
priority=100  matcher={}                        strategy='capacity'        // fallback: route to least-loaded
```

Evaluation order is **strict**. The engine walks rules top-to-bottom;
the first rule whose matcher fits **and** whose pool contains at least
one eligible rep wins. If a rule matches but its pool is empty (all
blacklisted, all inactive, all out of region), the engine moves on to
the next rule.

---

## 6. History Model — מודל היסטוריה

The history is stored as `Map<accountId, HistoryEntry[]>`. Key
properties:

1. **Append-only.** Every `assign`, `reassign`, `unassign`, `blacklist`
   pushes a frozen entry to the tail.
2. **Frozen rows.** Calling `history[i].reason = 'hacked'` throws in
   strict mode — test #21 enforces this.
3. **Previous pointer.** Every row carries
   `previous_assignee_id`, so you can render a hand-off timeline
   without re-scanning the array.
4. **Bilingual.** Every row has `reason_he` **and** `reason_en` as
   separate fields plus a combined `reason` field with a `|`
   separator.
5. **Never delete.** `unassign` does not remove the account — it
   stores a row with `assignee_id: null` and `action: 'unassign'`.
   The account remains in `listUnassigned()`.

---

## 7. Load Balancing — איזון עומסים

`balanceLoad(scope?)` iteratively moves accounts from the heaviest rep
(by load/capacity ratio) to the lightest until:

- the load-to-capacity ratios are equal, or
- the load gap is ≤ 1 account, or
- the lightest rep is at capacity, or
- the heaviest rep has no move-eligible accounts (respect blacklist &
  region constraints).

Each move is recorded as a normal `reassign` history entry with
reason `איזון עומסים | Load rebalance`. Test #12 seeds a
0–20 imbalance and asserts the post-rebalance gap is ≤ 1.

The iteration is hard-capped at `pool.length * 200` to guarantee
termination even under adversarial inputs.

---

## 8. Simulation (Dry-Run) — סימולציה

`simulateAssignment(accounts)` forks the entire engine — salespeople,
rules, accounts, history, blacklist, round-robin cursors — into a
throw-away clone, then runs the full assignment flow. Mutations stay
local to the clone, so the returned `{ results, loadDelta, warnings }`
answers the question "what happens if I import these 500 leads?"
without touching live state (test #23).

- `results[]` — one row per account in input order.
- `loadDelta[]` — per-salesperson before/after/delta counts.
- `warnings[]` — `{ code: 'unassigned' | 'error', message }`.

---

## 9. Blacklist — חסימות

Blacklist entries are append-only records of
`{ salesperson_id, account_id, reason, ts }`. They're enforced in
three places:

1. **`_poolFor()`** — blacklisted pair is filtered out of every
   strategy pool.
2. **`reassign()`** — throws if the target rep is blacklisted for
   the account (test #18).
3. **`balanceLoad()`** — won't move an account to a blacklisted
   target.

Typical uses: conflict of interest (brother-in-law works at the
target company), territory disputes, or an active dispute that
needs a cool-off period.

---

## 10. Bilingual Messages — הודעות דו-לשוניות

Every reason code has both Hebrew and English:

| key | Hebrew | English |
|---|---|---|
| `round-robin` | סבב הוגן — הוקצה לבא בתור | Round-robin rotation — next in queue |
| `weighted` | הגרלה משוקללת לפי משקלי אנשי מכירות | Weighted draw by salesperson weight |
| `skill` | התאמת כישורים / הסמכות לתכונות הלקוח | Skill / certification match to account traits |
| `capacity` | נציג בעומס הנמוך ביותר | Lowest-load salesperson |
| `account-owner` | שימור בעלים קיים (לקוח חוזר) | Existing owner preserved (returning customer) |
| `no-rule` | לא נמצאה חוקה מתאימה — לא שויך | No matching rule — left unassigned |
| `blacklisted` | חסום — ניגוד עניינים או אחר | Blacklisted — conflict of interest or other |
| `reassigned` | הועבר ידנית | Manually re-assigned |
| `unassigned` | בוטל שיוך | Unassigned |
| `rebalanced` | איזון עומסים | Load rebalance |
| `empty-pool` | אין נציגים פעילים בפול — שיוך נכשל | No active salespeople in pool — assignment failed |
| `over-capacity` | כל הנציגים מעל הקיבולת — שיוך נכשל | All salespeople over capacity — assignment failed |

Extra context can be appended via `reasonOf(key, extra)`, which
produces e.g. `הועבר ידנית (promotion) | Manually re-assigned (promotion)`.

---

## 11. Hebrew Glossary — מילון מונחים

| English | עברית | Notes |
|---|---|---|
| Account | לקוח / חשבון | |
| Salesperson / Sales rep | נציג מכירות | |
| Assignment | שיוך / הקצאה | |
| Round-robin | סבב הוגן | "Fair rotation" |
| Weighted | משוקלל | |
| Skill match | התאמת כישורים | |
| Capacity | קיבולת | |
| Load | עומס | |
| Account owner | בעלים של החשבון | |
| Blacklist | רשימה שחורה / חסימה | |
| Conflict of interest | ניגוד עניינים | |
| Rebalance | איזון מחדש | |
| Simulation / Dry-run | סימולציה / הרצה יבשה | |
| Rule | חוקה / כלל | |
| Priority | עדיפות | |
| Territory | טריטוריה / אזור | |
| Certification | הסמכה | |
| Returning customer | לקוח חוזר | |
| Ramp-up (new rep) | הרצה הדרגתית | |

---

## 12. Tests — מבחנים

30 tests, all passing, grouped by concern:

| # | Scenario | Focus |
|---|---|---|
| 1–3 | `defineRule` validation & ordering | Rule registry |
| 4–5 | Round-robin fairness + inactive skip | round-robin |
| 6–7 | Weighted distribution over 5000 trials | weighted |
| 8–9 | Skill hit scoring + capacity fallback | skill |
| 10–11 | Capacity least-loaded + over-capacity refusal | capacity |
| 12 | `balanceLoad` 20-acct imbalance → flat | rebalance |
| 13–14 | account-owner preserve + fallthrough on inactive | account-owner |
| 15–16 | Priority ordering + array matcher | rule eval |
| 17–19 | Blacklist prevents assign / reassign / lookups | blacklist |
| 20–21 | Reassign creates history, entries are frozen | history integrity |
| 22 | `listUnassigned` / `listByAssignee` | listings |
| 23–24 | `simulateAssignment` dry-run + warnings | simulation |
| 25 | Bilingual reason strings | i18n |
| 26 | Round-robin per-rule independent cursors | fairness edge |
| 27–28 | Error handling (duplicate rep, missing account.id) | validation |
| 29 | `unassign` records action, account stays listed | append-only |
| 30 | `stats()` counters | diagnostics |

Run: `node --test test/sales/account-assignment.test.js`

```
ℹ tests 30
ℹ pass  30
ℹ fail  0
ℹ duration_ms ~140
```

---

## 13. Usage Example — דוגמת שימוש

```js
const { AccountAssigner } = require('./src/sales/account-assignment');

const ac = new AccountAssigner({ seed: 20260411 });

// 1. Register the team
['alice','bob','carol','dave'].forEach(id => ac.registerSalesperson({
  id, name: id, capacity: 40, weight: 0.25,
  skills: ['hebrew','english']
}));

// Carol is a construction-certified senior
ac.upsertSalesperson({
  id: 'carol', weight: 0.35,
  skills: ['hebrew','english','construction','enterprise'],
  certifications: ['OSHA','ISO-9001'],
});

// 2. Define rules
ac.defineRule({                        // existing customers → same owner
  priority: 10, matcher: {}, strategy: 'account-owner',
});
ac.defineRule({                        // enterprise construction → skill match
  priority: 20,
  matcher: { industry: 'construction', size: ['enterprise','mid-market'] },
  strategy: 'skill',
});
ac.defineRule({                        // everything else → capacity
  priority: 100, strategy: 'capacity',
});

// 3. Blacklist (Bob's brother-in-law works at Acme)
ac.blacklist('bob', 'acme-001', 'conflict of interest — family tie');

// 4. Assign incoming leads
const r = ac.assign({
  id: 'acme-001', name: 'Acme Construction Ltd',
  industry: 'construction', size: 'enterprise',
  region: 'center', product: 'erp',
});
console.log(r.assignee_id);      // → 'carol' (highest skill match, bob blacklisted)
console.log(r.reason_he);        // → 'התאמת כישורים / הסמכות לתכונות הלקוח'

// 5. Dry-run for a CSV import
const sim = ac.simulateAssignment(importedLeads);
console.log(sim.loadDelta);      // per-rep before/after/delta

// 6. Rebalance end-of-quarter
const fix = ac.balanceLoad();
console.log(`moved ${fix.moves.length} accounts`);

// 7. Audit trail
console.log(ac.getHistory('acme-001'));
```

---

## 14. Non-Deletion Guarantees — הבטחות שימור

Per the system-wide rule **לא מוחקים רק משדרגים ומגדלים**:

1. **Rules are never removed.** `defineRule` only appends. If a
   rule becomes obsolete, define a new higher-priority rule that
   shadows it.
2. **Salespeople are never removed.** Set `active: false` via
   `upsertSalesperson` to take a rep out of rotation. Their load,
   history and skills remain queryable.
3. **Accounts are never removed.** `unassign` sets `assignee_id =
   null` and logs the action; the account stays in the store.
4. **History is frozen.** Every entry is `Object.freeze()`-d at
   insert time. Reassignment pushes a new row.
5. **Blacklist is append-only.** Adding a blacklist entry does not
   erase any prior assignment history.

---

## 15. Integration Points — נקודות אינטגרציה

| Upstream | Connects via |
|---|---|
| `onyx-procurement/src/crm/pipeline.js` | pipeline feeds new deals → `assign(account)` when a lead hits the Qualified stage |
| `onyx-procurement/src/imports/` | CSV lead imports use `simulateAssignment()` first, then commit |
| `onyx-procurement/src/hr/` | inactive employees trigger `upsertSalesperson({id, active:false})` |
| `onyx-procurement/src/audit/` | `getHistory()` rows feed the audit trail UI |
| `onyx-procurement/src/analytics/` | `stats()` + `listSalespeople()` power load dashboards |

---

## 16. Zero-Dependency Compliance

- `require('node:test')` and `require('node:assert/strict')` in tests
  (stdlib only).
- No imports in the source module at all — pure JavaScript, CommonJS.
- Deterministic xorshift32 RNG — no `Math.random` reliance for anything
  observable. Tests use `seed: 42` for reproducibility.
- Injectable clock (`opts.now`) so tests can pin the timestamp to
  `2026-04-11T09:00:00.000Z`.

---

## 17. File Paths

- **Source:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\sales\account-assignment.js`
- **Tests:**  `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\sales\account-assignment.test.js`
- **Report:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y029-account-assignment.md`

---

*כלל הברזל: לא מוחקים רק משדרגים ומגדלים.*
