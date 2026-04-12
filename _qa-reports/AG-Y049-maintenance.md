# AG-Y049 — Property Maintenance Requests (`MaintenanceRequests`)

**Agent:** Y-049
**Swarm:** Mega-ERP Techno-Kol Uzi — Kobi EL (real-estate vertical)
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/realestate/maintenance.js`
**Tests:**  `onyx-procurement/test/realestate/maintenance.test.js`
**Rule of the house:** **לא מוחקים — רק משדרגים ומגדלים.**

---

## 1. Summary

A zero-dependency, deterministic, bilingual (Hebrew / English) property
maintenance request lifecycle engine for the real-estate vertical of the
Mega-ERP (Techno-Kol Uzi / ONYX procurement layer).

The engine:

* Accepts tenant-originated maintenance calls (`createRequest`) with
  enforced categories, priorities and Hebrew description.
* Assigns vendors from the supplier catalog (`assignVendor`) — if a
  catalog is injected, it must know the vendor.
* Schedules visits (`scheduleVisit`) and records completion reports
  (`recordCompletion`) with parts, hours, cost, tenant signature.
* Splits cost between landlord and tenant per Israeli tenancy law
  (`splitCost`) with defaults for every category plus explicit override.
* Tracks SLA in real time (`slaTracker`) — emergency 4h, urgent 24h,
  normal 72h, low 7d — and freezes the breach on the request itself.
* Aggregates cost per property per period (`costAggregation`).
* Detects recurring / chronic issues (`recurringIssues`).
* Produces a Hebrew printable work order (`generateWorkOrderPDF`).
* **Never deletes** anything. `cancelRequest()` soft-cancels; every
  state transition is appended to `request.history[]`.

Test suite: **18 passing, 0 failing** (`node --test`, zero external deps).

---

## 2. Run the tests

```bash
# from repo root
cd onyx-procurement
node --test test/realestate/maintenance.test.js
```

Expected output (abridged):

```
✔ CONSTANTS — categories and priorities cover required set
✔ DEFAULT_SPLIT_BY_CATEGORY — each split sums to 100
✔ createRequest — validates inputs & assigns SLA due
✔ lifecycle — assignVendor → scheduleVisit → recordCompletion
✔ slaTracker — detects live breach and flags on request
✔ slaTracker — completed within SLA is not flagged
✔ slaTracker — completed after SLA is flagged at completion time
✔ splitCost — structural defaults to 100% landlord (Israeli law)
✔ splitCost — plumbing default 80/20
✔ splitCost — override with explicit 50/50 (misuse)
✔ splitCost — invalid overrides are rejected
✔ splitCost — cannot split before completion
✔ costAggregation — totals per property + per category
✔ costAggregation — period filter excludes out-of-range requests
✔ recurringIssues — detects unit-level hotspot (same cat+unit ≥2 in 180d)
✔ recurringIssues — does NOT flag one-off issues
✔ generateWorkOrderPDF — contains Hebrew sections and numbers
✔ cancelRequest — soft cancel, history preserved, no delete
ℹ pass 18  fail 0
```

---

## 3. Public API

```js
const {
  MaintenanceRequests,
  CATEGORIES,
  CATEGORY_HE,
  PRIORITIES,
  PRIORITY_HE,
  SLA_MS,
  SLA_HOURS,
  STATUS,
  STATUS_HE,
  DEFAULT_SPLIT_BY_CATEGORY,
} = require('./src/realestate/maintenance.js');

const m = new MaintenanceRequests({
  vendorCatalog,   // optional — any object with hasSupplier(id) or get(id)
  clock,           // optional — () => ms  (deterministic for tests)
});
```

### Methods

| Method | Purpose |
|---|---|
| `createRequest({propertyId, unit, tenant, category, description_he, priority, photos, reportedAt, description_en?})` | Create a request; throws on invalid input. Returns a frozen clone. |
| `assignVendor(requestId, vendorId, estimatedCost)` | Pick a vendor from the supplier catalog. |
| `scheduleVisit(requestId, date, notes)` | Set the visit date + notes. |
| `recordCompletion(requestId, {workPerformed, partsUsed, laborHours, totalCost, photos, tenantSignature})` | Mark completed; freezes SLA breach if late. |
| `splitCost(requestId, {landlordPct, tenantPct}?)` | Compute / record cost split; defaults come from the category table. |
| `slaTracker()` | Snapshot of every non-closed request with minutesRemaining + breach flag. |
| `costAggregation(propertyId, {from, to})` | Per-property period totals, by category, landlord vs tenant totals. |
| `recurringIssues(propertyId)` | `unit-hotspot` + `chronic-category` pattern detection. |
| `generateWorkOrderPDF(requestId)` | Hebrew printable work order (plain text, UTF-8). |
| `getRequest(id)`, `listRequests(filter)` | Read accessors. |
| `cancelRequest(id, reason)` | Soft cancel — status goes to `cancelled`, history grows. |
| `closeRequest(id)` | Final close after completion. |

No `deleteRequest` method exists — by design.

---

## 4. Category taxonomy

| Key | Hebrew | Typical work |
|---|---|---|
| `plumbing` | אינסטלציה | pipes, leaks, drains, water heater |
| `electrical` | חשמל | sockets, wiring, breakers, lighting |
| `hvac` | מיזוג אוויר | AC, central air, heating, filters |
| `structural` | מבני / שלד | walls, ceilings, floors, load-bearing, balconies |
| `appliance` | מכשיר חשמלי | landlord-supplied oven / fridge / washer |
| `pest` | הדברה | ants, roaches, rodents |
| `common-area` | שטחים משותפים | lobby, stairwells, elevator, garden |
| `other` | אחר | anything else |

---

## 5. SLA table

| Priority | Hebrew | SLA | Notes |
|---|---|---|---|
| `emergency` | חירום | **4 hours** | Water flooding, electrical hazard, gas leak, no power, locked out, tenant safety. |
| `urgent` | דחוף | **24 hours** | No hot water, AC in summer, broken fridge, major appliance down. |
| `normal` | רגיל | **72 hours** | Dripping tap, minor cracks, loose fixtures, squeaks. |
| `low` | נמוך | **7 days** | Cosmetic, deferred maintenance, non-functional nice-to-have. |

**Breach semantics**

* `slaTracker()` computes `breached = now > slaDueAt` for any non-closed
  request and, if so, writes `slaBreachedAt = slaDueAt` onto the request
  and appends an `sla-breached` history event. This **freezes** the
  breach so it survives later state changes.
* `recordCompletion()` checks the same condition and freezes the breach
  at completion time if the request finished after its SLA.
* Once frozen, `slaBreachedAt` never un-breaches — you can only clear
  it by upgrading the request (never delete).

---

## 6. Israeli landlord-tenant responsibility matrix

Legal basis: **חוק השכירות והשאילה, תשל"א-1971**
(Rental and Loan Law, 5731-1971)

Key sections:
* **סעיף 7(א)** — המשכיר חייב לתקן, תוך זמן סביר, כל פגם במושכר ובדרכי
  הגישה אליו, שהוא מסוג הפגמים ש״המשכיר סביר היה מתקנם״.
* **סעיף 8** — השוכר חייב להחזיר את המושכר כפי שקיבל, פרט לשינויים שאינם
  עולים לכדי בלאי סביר.
* **סעיף 25 (לתקופה של חוק השכירות ההוגנת)** — הפרדת אחריות לפי מהות הפגם.

In plain English:

> Structural and habitability defects are **landlord's** duty.
> Wear-and-tear, damage from misuse, and consumables are **tenant's** duty.
> Appliances provided by the landlord are landlord-majority.
> Pest issues default to balanced — the root cause decides.

### Default split table (`DEFAULT_SPLIT_BY_CATEGORY`)

| Category | Landlord | Tenant | Rationale |
|---|---:|---:|---|
| `plumbing` | 80% | 20% | Fixed pipes = landlord; clogs from misuse = tenant share. |
| `electrical` | 90% | 10% | Fixed wiring = landlord; bulbs / fuses the tenant broke = tenant share. |
| `hvac` | 80% | 20% | Central unit = landlord; user-replaceable filters = tenant. |
| `structural` | **100%** | 0% | Habitability — landlord-only per סעיף 7(א). |
| `appliance` | 70% | 30% | Only if landlord-supplied; tenant-supplied is 0/100. |
| `pest` | 50% | 50% | Whole-building infestation → landlord; housekeeping-caused → tenant. Balanced default. |
| `common-area` | **100%** | 0% | ועד בית / בעל הבית. |
| `other` | 50% | 50% | Neutral default — force an explicit override. |

Callers can always pass an explicit `{landlordPct, tenantPct}` to
`splitCost()`; the defaults are a legal-informed starting point, not a
legal opinion. **The module records `source: 'default-by-category'`
or `'override'`** so the audit trail is clear.

Shares always sum exactly to `totalCost` — the module rounds with the
landlord share first and derives the tenant share as `total − landlord`
to avoid the classic 0.01₪ floating-point gap.

---

## 7. Recurring-issue detection

`recurringIssues(propertyId)` emits two kinds of patterns:

1. **`unit-hotspot`** — same category and unit appearing **≥ 2 times
   within 180 days**. Surfaces "this apartment's plumbing has been
   called out 3 times in a month" even when overall totals are low.
2. **`chronic-category`** — same category appearing **≥ 3 times**
   anywhere in the property, regardless of unit. Surfaces building-wide
   systemic issues ("this whole property has a plumbing problem").

Each pattern carries `message_he` and `message_en` for direct display
in the dashboard and the Hebrew glossary below.

---

## 8. Work-order PDF (plain-text)

`generateWorkOrderPDF(requestId)` returns:

```js
{
  id,
  workOrderNumber,     // "WO-2026-00001"
  content,             // multi-line UTF-8 text, Hebrew + English side-by-side
  mime: 'text/plain; charset=utf-8',
  filename: 'WO-2026-00001.txt',
  bytes: <int>,
}
```

It is **deliberately not a binary PDF** — the module is zero-dep. The
content layout is designed to survive wkhtmltopdf / pdfkit / direct
raw-printing by downstream bridges, and already includes every Hebrew
label a printable work order needs:

```
============================================================
הזמנת עבודה / Work Order  WO-2026-00001
============================================================

תאריך דיווח / Reported:   2026-04-11T08:00:00.000Z
סטטוס / Status:            הושלמה (completed)
עדיפות / Priority:         חירום (emergency)
יעד SLA / SLA Due:         2026-04-11T12:00:00.000Z

------------------------------------------------------------
נכס / Property
------------------------------------------------------------
מזהה נכס / Property ID:    P-700
יחידה / Unit:              G-1

------------------------------------------------------------
דייר / Tenant
------------------------------------------------------------
שם / Name:                 משפחת כהן
טלפון / Phone:             050-1234567
דוא"ל / Email:             cohen@example.co.il

------------------------------------------------------------
תיאור הבעיה / Issue
------------------------------------------------------------
קטגוריה / Category:        אינסטלציה (plumbing)
תיאור / Description (HE):  נזילה מהתקרה

------------------------------------------------------------
ספק שובץ / Assigned Vendor
------------------------------------------------------------
מזהה ספק / Vendor ID:      VND-AQUA
עלות משוערת / Est. Cost:   ₪600.00
מועד ביקור / Scheduled:    2026-04-11T10:00:00.000Z
הערות / Notes:             דחוף — דירה שכנה מציפה

------------------------------------------------------------
דוח ביצוע / Completion Report
------------------------------------------------------------
תאריך ביצוע / Completed:   2026-04-11T08:00:00.000Z
עבודה שבוצעה / Work:       סגירת צינור סדוק
חלפים / Parts:
  • צינור פוליאתילן × 2 — ₪80.00
שעות עבודה / Labor (h):    2
עלות כוללת / Total Cost:   ₪640.00
חתימת דייר / Signature:    י. כהן

------------------------------------------------------------
חלוקת עלות / Cost Split
------------------------------------------------------------
בסיס חוקי / Legal Basis:   חוק השכירות והשאילה, תשל"א-1971
חלק המשכיר / Landlord:    80%  ₪512.00
חלק השוכר / Tenant:       20%  ₪128.00

============================================================
לא מוחקים — רק משדרגים ומגדלים. | Never delete — only upgrade and grow.
============================================================
```

---

## 9. Hebrew ↔ English glossary

| English | עברית | Notes |
|---|---|---|
| Maintenance request | קריאת אחזקה | Top-level entity. |
| Property | נכס | Building or group of units. |
| Unit / apartment | יחידה / דירה | `unit` field on the request. |
| Tenant | דייר / שוכר | Feminine: שוכרת. |
| Landlord | משכיר / בעל הנכס | Feminine: משכירה. |
| Vendor / supplier | ספק | Pulled from ONYX supplier catalog. |
| Work order | הזמנת עבודה | Printed artifact. |
| SLA due | יעד זמן תגובה | Priority-driven. |
| SLA breach | חריגה מ-SLA | Frozen on the request when detected. |
| Emergency | חירום | 4 hours. |
| Urgent | דחוף | 24 hours. |
| Normal | רגיל | 72 hours. |
| Low | נמוך | 7 days. |
| Plumbing | אינסטלציה |  |
| Electrical | חשמל |  |
| HVAC / A/C | מיזוג אוויר |  |
| Structural | מבני / שלד | 100% landlord. |
| Appliance | מכשיר חשמלי | Only if landlord-supplied. |
| Pest control | הדברה |  |
| Common area | שטחים משותפים | 100% landlord / ועד בית. |
| Other | אחר |  |
| Work performed | עבודה שבוצעה |  |
| Parts used | חלפים |  |
| Labor hours | שעות עבודה |  |
| Total cost | עלות כוללת | ₪, always 2 decimals. |
| Cost split | חלוקת עלות |  |
| Tenant signature | חתימת דייר |  |
| Landlord share | חלק המשכיר |  |
| Tenant share | חלק השוכר |  |
| Legal basis | בסיס חוקי | חוק השכירות והשאילה, תשל"א-1971. |
| Rental and Loan Law | חוק השכירות והשאילה | Main Israeli tenancy statute. |
| Habitability | תנאי מגורים סבירים | Landlord duty, סעיף 7(א). |
| Wear and tear | בלאי סביר | Tenant responsibility, סעיף 8. |
| Misuse / damage | שימוש לא סביר / נזק מכוון | Shifts responsibility to the tenant. |
| Chronic issue | בעיה כרונית | Recurring-issue pattern. |
| Hotspot | נקודה חמה | Unit-level recurrence. |
| Priority | עדיפות |  |
| Status | סטטוס |  |

---

## 10. Worked example — full lifecycle

```js
const { MaintenanceRequests } = require('./src/realestate/maintenance');
const m = new MaintenanceRequests({ vendorCatalog: supplierCatalog });

// 1. Tenant calls in an urgent plumbing issue
const req = m.createRequest({
  propertyId: 'P-100',
  unit: 'A-12',
  tenant: { name: 'משפחת כהן', phone: '050-1234567' },
  category: 'plumbing',
  description_he: 'נזילה מתחת לכיור במטבח',
  priority: 'urgent',
  reportedAt: '2026-04-11T08:00:00Z',
  photos: ['/uploads/leak-1.jpg'],
});
// req.slaDueAt === '2026-04-12T08:00:00.000Z'   (24h later)

// 2. Ops assigns a plumber from the catalog
m.assignVendor(req.id, 'VND-AQUA', 450);

// 3. Visit scheduled
m.scheduleVisit(req.id, '2026-04-11T14:00:00Z', 'להביא מפתח מיוחד');

// 4. Completion report
m.recordCompletion(req.id, {
  workPerformed: 'הוחלפה מפרקת + סיליקון חדש',
  partsUsed: [{ name: 'מפרקת פליז 1/2"', qty: 1, cost: 120 }],
  laborHours: 1.5,
  totalCost: 520,
  tenantSignature: 'כהן י.',
});

// 5. Cost split — plumbing default 80/20
const split = m.splitCost(req.id);
// split.landlordShare = 416, split.tenantShare = 104

// 6. Print the Hebrew work order
const wo = m.generateWorkOrderPDF(req.id);
fs.writeFileSync(wo.filename, wo.content, 'utf8');
```

---

## 11. "Never delete" semantics

| Operation | Effect |
|---|---|
| `createRequest` | Creates a new request; pushes `created` event onto `history[]`. |
| `assignVendor` | Updates `vendorId`, pushes `vendor-assigned`. |
| `scheduleVisit` | Updates `scheduledAt`, pushes `visit-scheduled`. |
| `recordCompletion` | Freezes completion + optional SLA breach, pushes `completed`. |
| `splitCost` | Writes `costSplit` block, pushes `cost-split`. |
| `cancelRequest(id, reason)` | Sets `status = cancelled`, pushes `cancelled` event — **request is still in the store and still visible via `listRequests()`**. |
| `closeRequest(id)` | Allowed only after `completed`; pushes `closed` event. |
| (No `deleteRequest`) | **By design.** |

Each mutation increments `updatedAt` and grows `history[]` — a tamper-
evident audit trail. This satisfies the house rule:
**לא מוחקים, רק משדרגים ומגדלים.**

---

## 12. Test coverage map

| Scenario | Test |
|---|---|
| Required constants are present | `CONSTANTS — categories and priorities cover required set` |
| Split table sums to 100 for every category | `DEFAULT_SPLIT_BY_CATEGORY — each split sums to 100` |
| Input validation + SLA due computation | `createRequest — validates inputs & assigns SLA due` |
| End-to-end happy path | `lifecycle — assignVendor → scheduleVisit → recordCompletion` |
| **SLA breach detection (live)** | `slaTracker — detects live breach and flags on request` |
| SLA ok when completed on time | `slaTracker — completed within SLA is not flagged` |
| SLA breach frozen at completion | `slaTracker — completed after SLA is flagged at completion time` |
| **Structural = 100% landlord** | `splitCost — structural defaults to 100% landlord (Israeli law)` |
| **Plumbing default 80/20** | `splitCost — plumbing default 80/20` |
| Explicit override | `splitCost — override with explicit 50/50 (misuse)` |
| Override validation | `splitCost — invalid overrides are rejected` |
| Guard — split before completion | `splitCost — cannot split before completion` |
| **Aggregation per property + per category** | `costAggregation — totals per property + per category` |
| Period filter | `costAggregation — period filter excludes out-of-range requests` |
| **Recurring pattern detection** | `recurringIssues — detects unit-level hotspot (same cat+unit ≥2 in 180d)` |
| Negative — no false positives | `recurringIssues — does NOT flag one-off issues` |
| **Hebrew work-order content** | `generateWorkOrderPDF — contains Hebrew sections and numbers` |
| **Soft cancel, no delete** | `cancelRequest — soft cancel, history preserved, no delete` |

---

## 13. Files

* **Engine:**  `onyx-procurement/src/realestate/maintenance.js`
* **Tests:**   `onyx-procurement/test/realestate/maintenance.test.js`
* **Report:**  `_qa-reports/AG-Y049-maintenance.md`   ← this file

No changes to sibling modules. Consumes the supplier catalog via an
injected `vendorCatalog` object (duck-typed: `hasSupplier(id)` or
`get(id)`) so the engine stays zero-dep and the ONYX procurement bridge
can wire it up without circular imports.

---

## 14. Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-04-11 | Initial engine, 18-test suite, bilingual work-order, Israeli cost-split defaults, SLA tracker, recurring pattern detection. |

**Never delete — only upgrade and grow.**
לא מוחקים — רק משדרגים ומגדלים.
