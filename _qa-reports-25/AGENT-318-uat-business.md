# AGENT-318 — UAT Agent: Real Business Operation Audit

**Date:** 2026-04-29
**Agent:** 318 (UAT)
**Client:** Techno-Kol Uzi — שערים, מעקות, פרגולות (gates / railings / pergolas)
**Persona:** Daily user (sales rep, ops manager, accountant, owner) trying to actually run the business
**Verdict:** RED — system passes file-existence tests, fails the daily-work test. Master Flow is declared but **not executable**. Quote-to-Cash and Project lifecycle are click-throughs over mock data.

---

## Executive Summary

The CLAUDE.md sets a clear bar: a **fully connected operating system** with end-to-end business flow, where every screen answers "Where am I? What do I do? What's next?". From a UAT perspective sitting at the user's desk:

1. **The "do something" buttons don't do anything.** Every primary action on Quote360, PO360, RFQ360 pops an `alert()` saying "פעולה נשלחה ל-Workflow Engine" and the request is never sent. This is theater, not an ERP. (`onyx-procurement/web/quote360.html:508`, `po360.html:450`, `rfq360.html:436`)
2. **The pipeline backbone is dead code.** All six pipeline modules expose `register*Routes(app)` functions; **zero of them are mounted in `server.js`**. `/api/orchestrator/execute`, `/api/wiring/spec`, `/api/workflows/:id`, `/api/state-machines/:type/transitions`, `/api/pipeline/stages`, `/api/entity-map/:type` — **all return 404**. The CLAUDE.md "Key APIs" section is aspirational.
3. **The 360 pages cannot read.** Quote360 calls `GET /api/quotes/:id` — that route does not exist anywhere; the page silently falls back to a hard-coded `mockQuote` object. Same for PO360 (`GET /api/pos/:id`) and RFQ360.
4. **VAT is wrong (real money bug).** Hard-coded `vat_rate: 17` in `quote360.html:207` and `po360.html:165`. Israeli VAT in 2026 is **18%** (correctly used in `petty-cash.js:44`, `referral.js:255`). A 1% gap on a שער / פרגולה quote of ₪50k is ₪500 lost or under-collected per deal.
5. **No industry fit.** The system has no entities/screens for **site visit, on-site measurement, installation slot, gate-spec sheet, pergola dimensions, warranty-on-install** — the bread-and-butter of שערים/מעקות/פרגולות. `src/construction/` contains exactly one file (`progress-billing.js`).
6. **CLAUDE.md says 9 Master 360 pages — only 5 exist.** `Project360`, `WorkOrder360`, `Finance360`, `Employee360` are missing. `entity360.html` is a generic placeholder, not a 360.
7. **Home screen does not link to the 360 pages.** `web/index.html` has 9 tiles → none point to Customer360, Quote360, PO360, RFQ360, Supplier360. A new sales rep cannot reach the work surface from the front door.

The system architecture (entity-map, state-machines, orchestrator, wiring-spec) is impressive on paper, but the wiring between the spec and the running server is severed. **An Israeli small business owner trying to issue a quote → close a deal → issue an invoice → collect payment cannot do any of it through this UI today.**

---

## Top Business Blockers (Critical)

### B-1 — Pipeline routes never mounted in server.js

**Title:** All 6 pipeline modules are dead — no `/api/orchestrator`, `/api/workflows`, `/api/wiring/spec`, `/api/state-machines`, `/api/entity-map`, `/api/pipeline/stages`.
**תיאור:** The architecture documented in CLAUDE.md ("Key APIs") is unreachable at runtime. Every `register*Routes()` function is exported but no caller exists in `server.js`.
**שלבים לשחזור:**
1. `cd onyx-procurement && npm start`
2. `curl http://localhost:3100/api/orchestrator/execute -X POST -d '{"action":"quote.send","context":{"id":"QT-1"}}'`
3. `curl http://localhost:3100/api/wiring/spec`
4. `curl http://localhost:3100/api/workflows/sales_to_project`
**בפועל:** All 4 calls return `404 Not Found` (Express default).
**צפוי:** All 4 should return JSON per the orchestrator/wiring spec.
**חומרה:** P0 — Critical (it is the architectural promise of the system).
**מודול:** `onyx-procurement/server.js`, `src/pipeline/*`
**תיקון:**
```js
// At the bottom of server.js, before app.listen:
const { registerWiringRoutes }       = require('./src/pipeline/wiring-spec');
const { registerEntityMapRoutes }    = require('./src/pipeline/entity-map');
const { registerStateMachineRoutes } = require('./src/pipeline/state-machines');
const { registerWorkflowRoutes }     = require('./src/pipeline/workflow-flows');
const { registerPipelineRoutes }     = require('./src/pipeline/pipeline-engine');
const { registerOrchestratorRoutes } = require('./src/pipeline/orchestrator');
registerWiringRoutes(app);
registerEntityMapRoutes(app);
registerStateMachineRoutes(app);
registerWorkflowRoutes(app);
registerPipelineRoutes(app, { supabase, audit });
registerOrchestratorRoutes(app, { supabase, audit, eventBus });
```

### B-2 — 360 pages run on hard-coded mock data and silent fallback

**Title:** Quote360 / PO360 / RFQ360 always show fake data — `try fetch ... catch { use mock }` is the design.
**תיאור:** `loadQuote()` calls `GET /api/quotes/:id`; if the route does not exist (it doesn't), the catch block sets `q = mockQuote` (`quote360.html:521-526`). User sees "QT-2026-0042 / אלקטרו-מערכות בע״מ / ₪199,134" — none of which exist in the database. No banner indicates demo mode.
**שלבים לשחזור:**
1. Open `/web/quote360.html?id=NOT-EXIST-XYZ`.
2. Page renders **identically** to `/web/quote360.html?id=QT-2026-0042` — both show the same mock customer, same total.
**בפועל:** User cannot distinguish real data from demo. Decisions are made on fiction.
**צפוי:** Either (a) call a real `GET /api/quotes/:id` and show "not found" on miss, or (b) display a clear "DEMO DATA" banner.
**חומרה:** P0 — Critical (data integrity / user trust).
**מודול:** `onyx-procurement/web/quote360.html`, `po360.html`, `rfq360.html`
**תיקון:** Implement `GET /api/quotes/:id`, `GET /api/pos/:id`, `GET /api/rfqs/:id` (the corresponding `crm-ultimate.ts` and `commercial/sales-orders.ts` routes are in `api-server` but Onyx-procurement does not proxy to them). Either add a reverse-proxy or move the 360 pages onto the api-server origin. Remove the silent fallback; show an error state.

### B-3 — Primary action buttons are alert() boxes

**Title:** "שלח ללקוח / בקש אישור / אשר / המר לפרויקט / ייצוא PDF" — every button shows a popup; no HTTP request leaves the browser.
**תיאור:** `doAction(actionId)` in quote360/po360/rfq360 only calls `confirm()` then `alert("נשלח ל-Workflow Engine")` (`quote360.html:505-510`). No `fetch()` is performed. The orchestrator endpoint it claims to call doesn't exist anyway (see B-1).
**שלבים לשחזור:**
1. Open quote360.html, click "שלח ללקוח".
2. Open Network tab — no requests.
3. Refresh page — quote is still in `state: 'sent'` because the mock object is reset on every load.
**בפועל:** No state change, no email sent, no audit row, no PDF generated. The user thinks "I clicked send, the customer has the quote". They don't.
**צפוי:** Click triggers `POST /api/orchestrator/execute { action:'quote.send', context:{id} }` and reloads, or a real route per `wiring-spec.js:170`.
**חומרה:** P0 — Critical (sales operations rely on this).
**מודול:** All 360 pages.
**תיקון:** Replace each `alert()` with `await fetch('/api/orchestrator/execute', { method:'POST', body: JSON.stringify({action, context}) })` and re-render on success. Pre-req: B-1.

### B-4 — Quote → Order → Invoice handoff missing

**Title:** No HTTP route to convert an approved quote into a sales order, and no route to convert a confirmed order into an invoice.
**תיאור:** `wiring-spec.js:170` declares `'quote.convert_to_project': POST /api/quotes/:id/convert-to-project`, and the orchestrator (`orchestrator.js:62`) defines the effects (`create_project`, `copy_quote_items`, `create_contract`). **Neither an Express handler nor an api-server handler exists.** Likewise no `quote → sales-order` and no `order → invoice` route. AGENT-159 already documented the same finding; nothing has been fixed.
**שלבים לשחזור:**
1. `grep -rn "convert-to-project\|convert-to-order" api-server/src/routes onyx-procurement/`
2. Result: zero handlers; only declarations in `wiring-spec.js`, `domain-model.js`, `entity-map.js`.
**בפועל:** Once a customer says "yes" to a quote, the user must re-key the entire deal as a project, then re-key it again as an invoice. Triple data entry, three places to make typos.
**צפוי:** One click "המר לפרויקט" creates a project, copies items, opens Project360.
**חומרה:** P0 — Critical (kills daily sales operations).
**מודול:** `api-server/src/routes/crm-ultimate.ts` or new `api-server/src/routes/quote-conversion.ts`
**תיקון:** Implement the three missing handoff routes. Each performs a single transaction: insert into target table, copy line items, write audit row, fire `quote.converted` event.

### B-5 — Wrong VAT rate (17 % vs 18 %) in quote/PO templates

**Title:** Hard-coded `vat_rate: 17` in two production HTML pages while backend uses `0.18`.
**תיאור:** Israeli VAT effective 2026-01-01 is 18 %. `quote360.html:207` and `po360.html:165` show 17 %. `crm-ultimate.ts:867` (per AGENT-159) also writes 17. Backend modules `petty-cash.js:44` and `referral.js:255` correctly use 0.18.
**שלבים לשחזור:** Open quote360.html, view "מע"מ (17%)" line on the summary card.
**בפועל:** Customer-facing quote calculates VAT at 17 %. Either (a) we under-collect by ₪500 on a ₪50,000 שער, or (b) we under-quote and lose margin if accounting later corrects.
**צפוי:** 18 % everywhere; ideally read from `getVatRateForDate(date)` so historical quotes stay correct.
**חומרה:** P0 — Critical (real money / tax exposure).
**מודול:** `web/quote360.html:207`, `web/po360.html:165`, plus any hard-codes in `api-server/src/routes/crm-ultimate.ts`.
**תיקון:** Replace literals with the existing `getVatRateForDate()` helper (`api-server/src/lib/vat.ts` or equivalent). Add a Jest test that fails if any source file contains the regex `vat_rate.*=.*17\b` outside historical migrations.

### B-6 — `mockQuote.salesperson = 'דוד כהן'` shipped to production HTML

**Title:** Hebrew dummy data in production-served HTML.
**תיאור:** Every 360 page ships with realistic-looking Hebrew demo data (customer "אלקטרו-מערכות בע״מ", sales rep "דוד כהן", invoice numbers, etc.). When the API is missing the page falls back here. A real customer logging in could see this content.
**שלבים לשחזור:** Hit `/web/quote360.html` while the api-server is down.
**בפועל:** Customer sees fake counterpart's quote.
**צפוי:** Loading or empty state, never another tenant's plausible-looking data.
**חומרה:** P1 — High (privacy & demo confusion).
**מודול:** All `web/*360.html`.
**תיקון:** Move mock to a separate `*-mock.json`, gate it behind `?demo=1`.

---

## High-Severity Business Blockers

### B-7 — Sales-order entity has no state machine

**Title:** `commercial.sales_orders` exists in DB but is missing from `state-machines.js` (which defines 13 machines).
**תיאור:** Lead/quote/po/project/invoice/etc. all have machines; the central business object **sales_order** does not. AGENT-159 confirmed `automationOrderConfirmed` is dead code (`automations.ts:33`, never called).
**שלבים:** `grep -n "sales_order" onyx-procurement/src/pipeline/state-machines.js` → 0 hits.
**בפועל:** When a user transitions a sales order, no inventory reservation, no draft invoice, no GL entry happens.
**צפוי:** Sales order state machine + triggers wired to `automationOrderConfirmed`.
**חומרה:** P0.
**מודול:** `onyx-procurement/src/pipeline/state-machines.js`, `api-server/src/routes/commercial/sales-orders.ts`
**תיקון:** Add `sales_order` machine; call `automationOrderConfirmed` in the `confirm` transition.

### B-8 — 4 of 9 Master 360 pages missing

**Title:** CLAUDE.md mandates 9 360 pages; only 5 exist.
**תיאור:** Missing: Project360, WorkOrder360, Finance360, Employee360. `entity360.html` is a generic switcher, not a 360 dashboard.
**שלבים:** `ls web/*360.html` → 5 files (Customer / Supplier / Quote / RFQ / PO).
**בפועל:** Project manager has no project surface; HR has no employee surface.
**צפוי:** All 9 with header+status, primary actions, related records, audit log, NBA, per CLAUDE.md.
**חומרה:** P0 (architectural promise).
**מודול:** `onyx-procurement/web/`
**תיקון:** Build the 4 missing 360 pages using the same skeleton as quote360.html.

### B-9 — Home page does not link to 360 pages

**Title:** `web/index.html` shows 9 tiles, none of which leads to Customer/Quote/Supplier/RFQ/PO 360.
**תיאור:** Tiles point to onyx-dashboard, vat-dashboard, bank-dashboard, annual-tax-dashboard, /payroll, /ops, /ai, pipeline-dashboard, status. Sales rep cannot reach Customer360 or Quote360 from the home page.
**שלבים:** Open index.html → look for "לקוחות / הצעות מחיר".
**בפועל:** Cannot navigate to the most-used surfaces.
**צפוי:** Top-level tiles for the 9 360s with counters.
**חומרה:** P1 — High (usability cliff).
**מודול:** `web/index.html`
**תיקון:** Add tiles + a global search box that fan-outs to the appropriate 360.

### B-10 — No industry-specific entities (gates/pergolas/railings)

**Title:** ERP is a generic CRM/ERP shell; nothing tailored to Techno-Kol Uzi's actual business.
**תיאור:** Daily work in this industry needs: site visit/measurement entity, gate-config sheet (height × width × material × color × motor), railing run length, pergola span/posts, installation calendar slot, post-install warranty registration, customer-signed installation acceptance. None exist. `src/construction/` has only `progress-billing.js`.
**שלבים:** `grep -rln "site_visit\|measurement\|installation_slot\|gate_spec\|pergola" src/` → 0 results.
**בפועל:** Sales rep falls back to spreadsheets and WhatsApp photos for measurements. ERP is a finance backend, not a production tool.
**צפוי:** Wizard "New Quote → Add Gate / Add Pergola / Add Railing" with material library, square-meter pricing, photos, drawings.
**חומרה:** P0 — Critical (no fit-for-purpose).
**מודול:** New `src/construction/site-visits.js`, `src/construction/product-spec.js`, `web/site-visit360.html`.
**תיקון:** Phase 1: catalog (gate/pergola/railing types). Phase 2: site-visit entity. Phase 3: link to quote line items.

### B-11 — `crm-ultimate.ts:572-587` SQL injection on Lead list (per AGENT-159)

**Title:** WHERE clause built by string concat from query params (`status`, `source`, `city`, `search`).
**תיאור:** Already documented in AGENT-159; restated because it is on the daily-use surface (the lead list).
**חומרה:** P0 — security & money.
**מודול:** `api-server/src/routes/crm-ultimate.ts:572`
**תיקון:** Use parameterized queries.

---

## Medium-Severity Findings

### B-12 — Three parallel quote tables (`crm_quotes`, public `quotes`, `commercial.quotes`)

Per AGENT-159 — not reconciled. UAT impact: list-of-quotes screen shows different counts depending on which API the screen calls. Confuses the owner reviewing weekly sales.
**חומרה:** P1.

### B-13 — Two parallel invoice tables (`finance.invoices`, `customer_invoices`)

Per AGENT-159. The "AR aging" page (`ar-enterprise.ts`) does not see invoices issued via `finance/invoices.ts:284`. Money silently disappears between screens.
**חומרה:** P1.

### B-14 — Issue invoice does not post to GL or VAT

`finance/invoices.ts:303` only updates `state`. The state-machine declares `post_to_gl, post_to_vat` triggers but no executor runs them. Owner closing the books at month-end has no GL entries from invoiced revenue.
**חומרה:** P0 (financial integrity), but already documented; restating from UAT angle.

### B-15 — Salesperson not chosen from a list

Quote360 stores `salesperson: 'דוד כהן'` as a free-text string. No FK to employees. Sales leaderboard cannot be computed.
**חומרה:** P1.
**תיקון:** Replace text with `sales_owner_id` FK to `hr.employees`.

### B-16 — No "next recommended action" computed from data

NBA (Next Best Action) on quote360.html is hard-coded `if/else` over `q.state`. Cannot incorporate "customer hasn't replied in 5 days → send reminder" because there is no communication history wired in.
**חומרה:** P2.
**מודול:** `web/quote360.html:282-304`, missing `src/communications/timeline.js`.

### B-17 — Audit log on 360 pages is from mock array

`mockQuote.audit` is hard-coded; even if a real audit row is written, the page does not read it.
**חומרה:** P1.
**תיקון:** `GET /api/audit?entity=quote&id=:id` and render.

### B-18 — Pipeline-dashboard is decoupled from real entity counts

The home tile points to `pipeline-dashboard.html`. The pipeline stages are declared in `pipeline-engine.js`; the dashboard shows numbers — but the underlying queries don't exist (B-1). Likely also static.
**חומרה:** P1.

### B-19 — No portal handoff to customer / supplier

Per CLAUDE.md "P1 portals". Daily test: a customer cannot view their quote online (the quote360 page is internal). Suppliers cannot accept RFQs without a portal. AGENT-145 covers this; UAT confirms it as a daily blocker for collection ops.
**חומרה:** P1.

---

## Daily-Work Walkthrough (the user persona test)

I walked through a normal Sunday morning at a שערים/מעקות/פרגולות business and noted what fails:

| Step | What the user wants | What happens | Verdict |
|---|---|---|---|
| 1 | Lead from Facebook ad → enter into ERP | `crm-ultimate.ts` POST /leads works | OK |
| 2 | Schedule on-site visit | No site-visit entity | **FAIL** (B-10) |
| 3 | At site, take measurements & photos | No mobile form | **FAIL** (B-10) |
| 4 | Generate quote with the right material/sq-m pricing | Quote builder is generic; no material catalog for gates | **FAIL** |
| 5 | Send PDF to customer | "Send" button is `alert()` | **FAIL** (B-3) |
| 6 | Customer says yes | Mark quote approved | OK on screen, no real DB write (B-2) |
| 7 | Convert to project | No `convert-to-project` API | **FAIL** (B-4) |
| 8 | Order materials | RFQ/PO routes exist, but no project link | Half-OK |
| 9 | Schedule installation crew | No scheduling/calendar surface | **FAIL** |
| 10 | Issue invoice on completion | `finance/invoices.ts` works; not wired to project | Half-OK |
| 11 | Match payment from bank statement | `bank-routes.js` exists | OK |
| 12 | Post-install warranty registration | No screen | **FAIL** |
| 13 | Yearly VAT report (PCN874) | `tax-exports/` and AGENT-132 OK | OK |
| 14 | Owner asks "what's the margin on pergolas this quarter" | Margin per category not computed | **FAIL** |

**Score:** 5 OK / 3 half-OK / 7 fail out of 15 daily steps. Below the threshold for "daily use".

---

## What Would Make This Pass UAT

Priority order, smallest changes first:

1. **Mount the 6 pipeline modules in server.js** (~30 lines, B-1).
2. **Add `GET /api/quotes/:id`, `/api/pos/:id`, `/api/rfqs/:id`** so 360 pages display real rows (B-2).
3. **Replace `alert()` with `fetch('/api/orchestrator/execute')`** on every primary action (B-3).
4. **Fix VAT 17→18** everywhere; add a regression test (B-5).
5. **Implement quote→project, quote→order, order→invoice handoff routes** (B-4).
6. **Add `sales_order` state machine; wire `automationOrderConfirmed`** (B-7).
7. **Build the 4 missing 360 pages** (Project / WorkOrder / Finance / Employee, B-8).
8. **Add tiles on home page for the 9 360s + global search** (B-9).
9. **Begin the construction-domain layer**: site-visit, gate-spec, pergola-spec, installation calendar, signed-acceptance (B-10).
10. **Reconcile the parallel quote/invoice tables**; one source of truth (B-12, B-13).

Items 1-4 are achievable in a single sprint and immediately turn the system from a click-through demo into something a sales rep can actually use.

---

## File Pointers

- `onyx-procurement/server.js` — pipeline modules NOT mounted (1838 lines, no `registerOrchestratorRoutes` / `registerWiringRoutes` / etc. calls)
- `onyx-procurement/src/pipeline/orchestrator.js:304-335` — defines `/api/orchestrator/execute`, never wired
- `onyx-procurement/src/pipeline/wiring-spec.js:303` — `registerWiringRoutes(app)` never called
- `onyx-procurement/src/pipeline/state-machines.js:415` — `registerStateMachineRoutes(app)` never called
- `onyx-procurement/src/pipeline/workflow-flows.js:115` — `registerWorkflowRoutes(app)` never called
- `onyx-procurement/src/pipeline/pipeline-engine.js:347` — `registerPipelineRoutes(app, deps)` never called
- `onyx-procurement/src/pipeline/entity-map.js:376` — `registerEntityMapRoutes(app)` never called
- `onyx-procurement/web/quote360.html:192-230` — hard-coded `mockQuote`
- `onyx-procurement/web/quote360.html:207` — `vat_rate: 17` (BUG — should be 18)
- `onyx-procurement/web/quote360.html:505-510` — `doAction()` only calls `alert()`
- `onyx-procurement/web/quote360.html:514-543` — `loadQuote()` falls back to mock on any fetch failure
- `onyx-procurement/web/po360.html:165` — `vat_rate: 17` (BUG)
- `onyx-procurement/web/po360.html:450` — `doAction()` only calls `alert()`
- `onyx-procurement/web/rfq360.html:436` — `doAction()` only calls `alert()`
- `onyx-procurement/web/index.html:292-443` — 9 home tiles, no 360 links
- `onyx-procurement/src/construction/progress-billing.js` — only construction-specific file (insufficient for gates/pergolas/railings)
- `_qa-reports-25/AGENT-159-quote-to-cash.md` — prior report covering the same spec gap
- `CLAUDE.md:34` — declares 9 Master 360 pages (4 missing on disk)

---

**Bottom line:** the system **declares** a Palantir-grade ERP and **looks like** one in the source tree, but a daily user cannot complete a single end-to-end deal. The fix is small in code but architectural in intent: **mount the pipeline, wire the buttons, build the missing 4 360s, and add the construction-domain entities** that match Techno-Kol Uzi's actual product line.
