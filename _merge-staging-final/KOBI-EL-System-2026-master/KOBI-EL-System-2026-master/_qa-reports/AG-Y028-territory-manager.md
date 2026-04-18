# AG-Y028 — Sales Territory Manager (מנהל טריטוריות מכירה)

**Agent:** Y-028 — Swarm Sales
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/sales/territory-manager.js`
**Test:** `onyx-procurement/test/sales/territory-manager.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
**Status:** 26/26 tests passing

---

## 1. Purpose — מטרת המודול

The Sales Territory Manager partitions the customer base into
**sales territories** (טריטוריות מכירה) so that every account is owned
by exactly one salesperson/team, coverage is complete, overlaps are
surfaced for resolution, and the workload can be rebalanced across
the team. It is designed for Israeli organisations with bilingual
(Hebrew + English) operations and is the canonical home of the
Israeli regional zip-code map used elsewhere in the ERP.

Zero-dependency, in-memory, fully deterministic. Exposes a single
class `TerritoryManager` plus introspection helpers (`regions()`,
`ruleTypes()`, `_internals`).

---

## 2. Public API — ממשק ציבורי

| Method | Purpose |
|---|---|
| `defineTerritory({id, name_he, name_en, rules, salespeople, rule_priority?, active?})` | Create a territory — הגדרת טריטוריה חדשה |
| `updateTerritory(id, patch)` | Upgrade (rename, re-rule, retire by `active=false`) — שדרוג/השבתה |
| `listTerritories()` | All territories including retired — כל הטריטוריות |
| `getTerritory(id)` | Single territory (cloned) — טריטוריה יחידה |
| `assignAccount(account)` | Auto-assign to best-matching territory — שיוך אוטומטי |
| `reassignAll(accounts)` | Bulk auto-assign — שיוך קבוצתי |
| `coverageCheck(accounts)` | Find uncovered + overlapping accounts — בדיקת כיסוי |
| `rebalance({metric, accounts})` | LPT rebalance plan — איזון מחדש |
| `territoryPerformance(id, period, accounts)` | KPI per territory — ביצועי טריטוריה |
| `handoff({fromTerritory, toTerritory, effectiveDate, accounts, reason?})` | Append-only handoff record — העברה |
| `listHandoffs(territoryId?)` | Full handoff history — היסטוריית העברות |
| `matchScore(territory, account)` | 0..1 score — ציון התאמה |
| `accountRegion(account)` | Resolve region from explicit region → city → zip — אזור לפי כתובת |
| `regions()` | Introspection: 6 Israeli regions — אזורים |
| `ruleTypes()` | Introspection: 4 rule types — סוגי כללים |

---

## 3. Rule Types — סוגי כללים

The matcher evaluates each rule against an account and scores a
territory by `matched_rules / total_rules`. A territory needs
**at least one** matching rule to be a candidate.

| Type | Hebrew | English | Value shape | Example |
|---|---|---|---|---|
| `geo` | גאוגרפי | Geographic | `{region, cities?, zip_ranges?}` or string region | `{region:'tel_aviv_metro'}` |
| `industry` | ענף | Industry | string or string[] | `['construction','בנייה']` |
| `size` | גודל חברה | Company Size | `{min?, max?, metric:'employees'\|'revenue'}` | `{min:250, metric:'employees'}` |
| `product` | מוצר / קו-מוצר | Product Line | string or string[] | `['paint','primer','צבע']` |

**Geo rule evaluation order:**

1. Explicit `cities` list on the rule → substring match on normalised city name.
2. Explicit `zip_ranges` → 7-digit zip numeric containment.
3. Target `region` → account's resolved region (`region → city → zip`).

**Size rule** supports both headcount (`employees`) and revenue
(`annual_revenue` / `revenue`). `min` is inclusive, `max` is inclusive.

**Tie-break order** when multiple territories score identically:

1. `rule_priority` ascending (lower number = higher priority, Linux `nice` convention).
2. `created_at` ascending — earliest-defined territory wins deterministically.

---

## 4. Israeli Regions — אזורים גאוגרפיים בישראל

Six canonical regions, all bilingual, covering the entire country
with zip-code fallback for accounts that do not supply a city.

| Key | Hebrew | English | Flagship cities | Zip blocks (7-digit numeric) |
|---|---|---|---|---|
| `north` | צפון | Northern | צפת, קרית שמונה, עכו, נהריה, כרמיאל, טבריה, עפולה, נצרת, בית שאן, מעלות תרשיחא | 1000000-1299999, 1300000-1399999, 1400000-1599999, 1600000-1799999, 1800000-1999999, 2000000-2199999, 2200000-2399999, 2400000-2499999 |
| `haifa_metro` | מטרופולין חיפה | Haifa Metro | חיפה, קרית אתא, קרית ביאליק, קרית ים, קרית מוצקין, טירת כרמל, נשר, יקנעם, דלית אל כרמל | 2500000-2999999, 3000000-3599999, 3600000-3999999 |
| `central` | מרכז | Central (Sharon + Shfela) | נתניה, הרצליה, רעננה, כפר סבא, הוד השרון, פתח תקווה, ראשון לציון, רחובות, נס ציונה, יבנה, מודיעין, לוד, רמלה | 4000000-4299999, 4300000-4599999, 4600000-4799999, 4800000-4999999, 7000000-7199999, 7300000-7499999, 7400000-7699999 |
| `tel_aviv_metro` | מטרופולין תל אביב | Tel Aviv Metro | תל אביב-יפו, רמת גן, גבעתיים, בני ברק, חולון, בת ים, אור יהודה, קרית אונו, רמת השרון | 5100000-5199999, 5200000-5299999, 5300000-5399999, 5400000-5499999, 5500000-5899999, 5900000-5999999, 6000000-6999999 |
| `jerusalem` | ירושלים | Jerusalem | ירושלים, מבשרת ציון, בית שמש, מעלה אדומים, גבעת זאב, אפרת | 9000000-9099999, 9100000-9699999, 9700000-9799999, 9800000-9899999, 9900000-9999999 |
| `south` | דרום | Southern | באר שבע, אשקלון, אשדוד, קרית גת, אילת, דימונה, ערד, אופקים, שדרות, נתיבות, ירוחם, מצפה רמון | 7700000-7899999, 8000000-8299999, 8300000-8599999, 8600000-8699999, 8700000-8799999, 8800000-8899999, 8900000-8999999 |

**Zip normalisation.** Israel Post officially uses 7-digit zips;
the ERP also accepts 5- and 6-digit inputs (older CRM extracts).
`parseZip()` strips separators and pads right-with-zero to 7 digits so
every zip lives in the same numeric space:

```
'12345'    → 1234500
'123456'   → 1234560
'1234567'  → 1234567
'1234-567' → 1234567
```

**City matching.** Substring, case-insensitive, quote- and hyphen-tolerant,
whitespace-collapsed. Hebrew and English spellings of the same city
both resolve to the same region (e.g. `"Tel Aviv"` and `"תל אביב"` both
→ `tel_aviv_metro`).

---

## 5. Coverage Check — בדיקת כיסוי

`coverageCheck(accounts)` classifies every account into one of three buckets:

| Bucket | Trigger | Meaning (Hebrew / English) |
|---|---|---|
| `uncovered` | zero territories match | לא מכוסה / No active territory owns this account — **assignment gap** |
| `covered` | exactly 1 territory matches | מכוסה / Clean ownership |
| `overlaps` | ≥ 2 territories match | חפיפה / Ambiguous ownership — **requires policy resolution** |

Overlaps carry a `severity` flag: `high` if 3 or more territories match,
otherwise `medium`. The `uncovered` bucket also reports the
`resolved_region` (if any) so operators can see *which* region is
missing a territory definition.

---

## 6. Rebalance Algorithm — אלגוריתם איזון מחדש

`rebalance({metric, accounts})` produces a re-assignment **plan** that
evens a chosen metric across all active territories. It does **not**
mutate the territories — it returns a plan for operator review.

**Metric choices:**

| Metric | Hebrew | What is summed per territory |
|---|---|---|
| `accounts` | מספר לקוחות | count of owned accounts (each = 1) |
| `revenue`  | הכנסות        | `account.revenue` total |
| `pipeline` | צנרת מכירות | `account.pipeline` total |

**Algorithm — Longest Processing Time (LPT) greedy:**

1. Snapshot the **before** load of every active territory from each
   account's `assigned_territory`.
2. Sort accounts descending by combined size (`revenue + pipeline`)
   — the largest accounts get placed first, which is the classic LPT
   heuristic for minimising makespan on parallel machines.
3. For each account, collect the territories whose rules still match
   it (an account that no territory can legally own is flagged as
   `unmovable` and left with its current owner).
4. Pick the candidate territory with the smallest current **after**
   load. Tie-break on `rule_priority` then on `created_at`.
5. Add the account's metric contribution to that territory's after
   load and, if it differs from the current owner, add a plan entry
   `{ account_id, from, to, delta, unmovable:false }`.
6. Report `spread_before = max-min of before`, `spread_after = max-min
   of after`, and `improved = spread_after <= spread_before`.

LPT is O(n log n) and is known to be within 4/3 - 1/(3m) of optimal
for makespan; in practice it is more than good enough for weekly
sales-ops rebalances of a few hundred to a few thousand accounts.

**Worked example (accounts metric, test #15):**
6 accounts all matching both `t1` and `t2`, currently all on `t1`.
Before: `{t1:6, t2:0}`, spread 6. After LPT: `{t1:3, t2:3}`, spread 0.
Plan contains 3 move entries.

**Worked example (revenue metric, test #16):**
Accounts with revenue [1,000,000 · 500,000 · 400,000 · 100,000],
all on `t1`. LPT output: t1=1,000,000 (the single large account);
t2=1,000,000 (500k + 400k + 100k). Spread collapses to 0.

---

## 7. Territory Performance — מדדי ביצוע

`territoryPerformance(id, period, accounts)` emits:

| Field | Meaning |
|---|---|
| `account_count` | מספר לקוחות פעילים |
| `revenue` | הכנסות מצטברות (ILS) |
| `pipeline` | צנרת מכירות פתוחה (ILS) |
| `active_deals` | עסקאות פעילות |
| `win_count` / `loss_count` | זכיות / הפסדים |
| `win_rate` | יחס זכייה (`wins / (wins+losses)`) |
| `quota` | מכסת הטריטוריה (סכום מכסות אנשי המכירות) |
| `quota_attainment` | עמידה במכסה (`revenue / quota`) |
| `salespeople_count` | מספר אנשי מכירות |
| `territory_name` | `{he, en}` bilingual label |

`period` is a free-form metadata passthrough (`'month'`, `'quarter'`,
`{from, to}`, etc.) so the caller can stamp reports consistently.

---

## 8. Handoffs — העברות בין טריטוריות

`handoff({fromTerritory, toTerritory, effectiveDate, accounts, reason?})`
is **append-only**. Handoff records are never mutated or deleted; even
`updateTerritory(..., {active:false})` does not touch them. Every
handoff:

1. Validates both territories exist and the target is active.
2. Generates a deterministic `hof_NNNNNN` id.
3. Moves the account ids from the `from` territory's roster to the
   `to` territory's roster (and touches both `updated_at` stamps).
4. Appends the record to an internal append-only log.

`listHandoffs(territoryId?)` returns the full history, optionally
filtered by territory (as either the from or to side).

---

## 9. Never Delete — לא מוחקים, רק משדרגים

| Operation | What would "delete" look like | What we do instead |
|---|---|---|
| Retire a territory | `tm.delete(id)` | `tm.updateTerritory(id, {active:false})` — still enumerated by `listTerritories()`, just excluded from matching |
| Rename / reshape a territory | replace spec | `updateTerritory()` patches in place, `updated_at` is bumped |
| Move accounts between territories | overwrite assignment | `handoff()` — append-only, carries `effective_date` and `reason` |
| Reassign an account | silent overwrite | `account.assigned_territory_history[]` keeps every past assignment with timestamp |

Data can only grow. A future audit can always reconstruct *who owned
what account on any given date* by replaying `handoffs` + assignment
history.

---

## 10. Test Coverage — כיסוי בדיקות

`node --test test/sales/territory-manager.test.js` — **26 pass / 0 fail**.

| # | Test | What it proves |
|---|---|---|
| 01 | defineTerritory basic | ids and spec storage |
| 02 | defineTerritory invalid rule | validation rejects unknown `type` |
| 03 | city → region | 6 cities + 6 Hebrew spellings + misses |
| 04 | zip → region | all 6 region zip blocks + partial-digit padding |
| 05 | assignAccount by city | TLV city resolves to TLV metro |
| 06 | industry rule | hit + miss |
| 07 | size rule | employees AND revenue metrics |
| 08 | product rule | intersection of product lists |
| 09 | best-match scoring + priority | narrow beats broad when priority boosted |
| 10 | tie-break | deterministic creation-order fallback |
| 11 | unassigned | `null` territory_id when nothing matches |
| 12 | coverage: uncovered | two out of three accounts flagged |
| 13 | coverage: overlap | account matching 2 territories surfaces overlap |
| 14 | coverage: clean | 3 regions, 3 territories, zero overlap |
| 15 | rebalance — accounts | 6→3/3 with 3 move entries |
| 16 | rebalance — revenue | LPT collapses 2M/0 spread to 1M/1M |
| 17 | rebalance — pipeline | plan entries emitted |
| 18 | rebalance — bad metric throws | `'weight'` rejected |
| 19 | territoryPerformance KPIs | revenue, pipeline, win rate, attainment, bilingual name |
| 20 | handoff | append-only + roster moves + history filter |
| 21 | handoff unknown territory throws | from- and to-side |
| 22 | retire territory | `active:false` stops matching but keeps record |
| 23 | regions() | 6 bilingual regions, nonzero zip_ranges + cities |
| 24 | ruleTypes() | 4 bilingual types |
| 25 | bilingual labels | RULE_TYPES, METRICS, REGIONS, territory spec |
| 26 | accountRegion precedence | explicit > city > zip > null |

---

## 11. Hebrew Glossary — מילון עברי

| Hebrew | Transliteration | English |
|---|---|---|
| טריטוריה | teritoria | territory |
| מנהל טריטוריות מכירה | menahel teritoriot mechira | sales territory manager |
| איש מכירות / אשת מכירות | ish/eshet mechira | salesperson |
| כלל שיוך | klal shiyuch | assignment rule |
| שיוך אוטומטי | shiyuch otomati | auto-assignment |
| חשבון לקוח | cheshbon lakoach | customer account |
| כיסוי | kisuy | coverage |
| חפיפה | chafifa | overlap |
| לא מכוסה | lo mechuse | uncovered |
| איזון מחדש | izun mechadash | rebalance |
| מכסה | mechasa | quota |
| עמידה במכסה | amida bemichsa | quota attainment |
| צנרת מכירות | tzinoret mechirot | sales pipeline |
| זכייה / הפסד | zchiya / hefsed | win / loss |
| יחס זכייה | yachas zchiya | win rate |
| העברה | ha'avara | handoff |
| תאריך תחולה | ta'arich techula | effective date |
| אזור / מחוז | ezor / machoz | region / district |
| מיקוד | mikud | zip code |
| צפון | tzafon | north |
| מרכז | merkaz | central |
| דרום | darom | south |
| ירושלים | Yerushalayim | Jerusalem |
| מטרופולין תל אביב | metropolin Tel Aviv | Tel Aviv Metro |
| מטרופולין חיפה | metropolin Haifa | Haifa Metro |
| ענף | anaf | industry sector |
| גודל חברה | godel chevra | company size |
| מוצר / קו-מוצר | mutzar / kav-mutzar | product / product line |
| לא מוחקים רק משדרגים ומגדלים | — | never delete, only upgrade & grow |

---

## 12. Integration Notes — אינטגרציה

* **CRM Pipeline** (`src/crm/pipeline.js`) — a deal's `owner` field
  should mirror the territory's salespeople. Coverage check can feed
  the CRM's weekly ops report to flag ownerless deals.
* **Customer Portal** (`src/customer-portal/...`) — a customer's
  "your rep" widget reads `assigned_territory` and pulls
  `salespeople[0]` for the display card.
* **Future:** A map-UI in the dashboard can use `regions()` as a
  lookup table for choropleth shading by `rebalance().after[id]`.

## 13. Files — קבצים

* Module: `onyx-procurement/src/sales/territory-manager.js` (zero dep)
* Test:   `onyx-procurement/test/sales/territory-manager.test.js` (26 tests)
* Report: `_qa-reports/AG-Y028-territory-manager.md` (this file)
