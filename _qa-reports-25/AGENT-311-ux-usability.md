# AGENT-311 — UX / Usability Audit

**Agent:** Agent-311 (UX & Usability)
**Date:** 2026-04-29
**Scope:** 9 Master 360 pages + key list/dashboard/Alert pages in `techno-kol-ops/client`, `onyx-procurement`
**Reference Spec:** `CLAUDE.md` § "9 Master 360 Pages" + `onyx-procurement/src/pipeline/wiring-spec.js` § PAGE_CONTRACTS
**Mode:** Read-only audit. No source files modified.

---

## Verdict snapshot

| 360 page | Spec tabs | Implemented tabs | Primary actions: spec/impl | Audit log | Empty state | Error state | Verdict |
|---|---:|---:|---:|:---:|:---:|:---:|---|
| Customer360 (`pages/360`) | 11 | **0** (flat sections) | 3 / 3 | YES | partial | YES | P1 |
| Customer360 (`features/customers`) | 11 | 8 | 3 / 3 | YES | YES | YES | OK |
| Supplier360 | 12 | 0 (flat) | 4 / 2 | YES | partial | YES | P1 |
| Quote360 | 8 | 0 (flat) | 3 / 2 | YES | partial | YES | P1 |
| RFQ360 | 8 | 0 (flat) | 4 / **2 stub** | YES | partial | YES | P0 |
| Project360 | 16 | 0 (flat) | 8 / 2 | YES | partial | YES | P0 |
| WorkOrder360 | 12 | 0 (flat) | 7 / 2 | YES | partial | YES | P1 |
| PO360 | 11 | 0 (flat) | 5 / 2 | YES | partial | YES | P1 |
| Finance360 | 12 | 0 (flat) | 5 / **0** | YES | partial | YES | P0 |
| Employee360 | 11 | 0 (flat) | 3 / **2 stub** | YES | partial | YES | P0 |

Overall: every 360 page in `techno-kol-ops/client/src/pages/360/` ships as a single flat scroll without the tab structure mandated by `PAGE_CONTRACTS`. Two pages have action buttons that are pure no-ops. One page is missing actions entirely. Two parallel Customer360 implementations contradict each other.

---

## Issues

### UX-001 — Two contradictory Customer360 pages exist in the same repo
- **Description:** `techno-kol-ops/client/src/pages/360/Customer360.tsx` (140 lines, flat layout, no tabs, RTL) and `onyx-procurement/src/features/customers/Customer360.tsx` (700+ lines, tab-based, light theme, no RTL wrapper) both claim to be "the" Customer360. They use different APIs (Supabase RPC vs. REST `/api/customers/:id/360`), different state badge palettes (dark `bg-green-600/20` vs. light `bg-emerald-100`), different action labels (`+ הצעת מחיר חדשה` vs. `צור הצעת מחיר`), and different empty/error styles. The router that decides which one renders is unclear from the file tree.
- **Steps:** Open `/360/customer/123` (likely the ops route) vs. opening Customer360 from the procurement service.
- **Actual:** Two visibly different pages. A user clicking "לקוח" from a quote in OPS lands on a flat dark RTL view; the same customer opened from Onyx Procurement is light-theme, English-aligned, with tabs.
- **Expected:** One canonical Customer360. The CLAUDE.md "No Dead Pages Rule" requires a consistent experience.
- **Severity:** P0
- **Module:** `techno-kol-ops/client/src/pages/360/Customer360.tsx`, `onyx-procurement/src/features/customers/Customer360.tsx`
- **Fix:** Pick `features/customers/Customer360.tsx` (it already implements tabs + count badges and matches `PAGE_CONTRACTS.customer360`) as the canonical version, port it to RTL, replace the flat `pages/360/Customer360.tsx` with a re-export, remove the duplicate.

### UX-002 — All 8 ops 360 pages flatten the spec's tabbed contract into a single scroll
- **Description:** `wiring-spec.js` defines tabs per 360 page (e.g. `project360` requires 16 tabs: overview, timeline, work_orders, procurement, materials, inventory, employees, tasks, expenses, logistics, invoices, payments, reports, alerts, documents, audit_log). Every page in `techno-kol-ops/client/src/pages/360/` (Quote360, RFQ360, Project360, WorkOrder360, PO360, Finance360, Supplier360, Employee360) renders all sections vertically with no tab navigation.
- **Steps:** Open `/360/project/1` and try to find "alerts" or "logistics".
- **Actual:** User must scroll through every section — KPIs, work orders, POs, documents, audit — even when looking only at "alerts". The page becomes a tall scroll wall on real projects with 50+ work orders. No way to deep-link to a specific tab (`#tab=invoices`).
- **Expected:** Tab navigation matching `PAGE_CONTRACTS` so users can jump to "execution", "materials", or "audit_log" without scrolling. A `TabButton` component already exists in `features/customers/Customer360.tsx:378`.
- **Severity:** P1
- **Module:** `techno-kol-ops/client/src/pages/360/*.tsx` (8 pages)
- **Fix:** Extend `shared360.tsx` with a `Tabs` component (active tab state + `?tab=` URL sync). Convert each page to wrap related sections inside `<Tab id="execution">`, `<Tab id="materials">`, etc., and default to the first tab.

### UX-003 — RFQ360 ship action buttons that do nothing
- **Description:** `RFQ360.tsx:35-36` renders `<ActionBtn label="שלח לספקים" onClick={() => {}} />` and `<ActionBtn label="החלטה" onClick={() => {}} />`. Both buttons appear primary, are placed in the main header action area, but execute an empty arrow function.
- **Steps:** Open any RFQ → click "שלח לספקים".
- **Actual:** Nothing happens. No toast, no error, no network call. Clicker has no idea whether the system "remembered" the action.
- **Expected:** Spec mandates `rfq.send_to_suppliers` action wired to `POST /api/rfq/:id/send` (`wiring-spec.js:175`). Clicking should call orchestrator, show "נשלח לספקים — N הוזמנו" flash, and refresh.
- **Severity:** P0
- **Module:** `techno-kol-ops/client/src/pages/360/RFQ360.tsx`
- **Fix:** Implement `runAction("rfq.send_to_suppliers", "שליחה לספקים")` and `runAction("rfq.decide", "החלטה")` using the same `apiPost("/api/orchestrator/execute", ...)` pattern already used in Quote360 and PO360.

### UX-004 — Employee360 buttons no-op silently
- **Description:** `Employee360.tsx:34-35` renders `<ActionBtn label="חישוב שכר" onClick={() => {}} />` and `<ActionBtn label="בקשת חופשה" onClick={() => {}} />`. Same pattern as UX-003.
- **Steps:** Open any employee → click "חישוב שכר".
- **Actual:** Silent no-op. The user assumes the request went to payroll; nothing happens.
- **Expected:** Per spec (`PAGE_CONTRACTS.employee360`) primary actions are `add_attendance`, `assign_work_order`, `calculate_payroll`. They must call orchestrator endpoints.
- **Severity:** P0
- **Module:** `techno-kol-ops/client/src/pages/360/Employee360.tsx`
- **Fix:** Wire to orchestrator. For "חישוב שכר", confirm with a dialog (irreversible monthly action) and call `POST /api/orchestrator/execute { action: "payroll.calculate", entity: "employee", entity_id }`.

### UX-005 — Finance360 has zero primary actions
- **Description:** `Finance360.tsx:24-53` shows KPIs, line items, payments, documents, audit — but no action buttons at all. `PAGE_CONTRACTS.finance360.primary_actions = ['issue_invoice', 'register_payment', 'reconcile_bank', 'export_tax', 'open_collection_case']`.
- **Steps:** Open an invoice with `balance_due > 0` and try to record a payment.
- **Actual:** No "Register payment" button. User has to leave the page and navigate to a separate payments form, breaking the 360 flow.
- **Expected:** "רישום תשלום" + "פתיחת תיק גבייה" buttons visible when balance_due > 0; "ייצוא מע״מ" always.
- **Severity:** P0
- **Module:** `techno-kol-ops/client/src/pages/360/Finance360.tsx`
- **Fix:** Add an actions row identical to Quote360 with conditional visibility based on `inv.balance_due`, `inv.state`.

### UX-006 — Action buttons render confusing "+ X" prefix even when no record is being created
- **Description:** `shared360.tsx:73` `<ActionBtn>` always prepends `+ ` to the label. Used for "+ קבלת סחורה" (PO360), "+ אשר ושלח" (Quote360), "+ פתח ספק" (PO360 navigation). The "+" symbol universally means "create new"; using it for "approve and send" or "open supplier" misleads.
- **Steps:** Open Quote360 → see button "+ אשר ושלח" (Approve and Send).
- **Actual:** New users hesitate, expecting the button to create a new record.
- **Expected:** Reserve "+" for create actions. Use the `variant="secondary"` look (no plus) for transitions/navigation, and `variant="primary"` (no plus) for state changes.
- **Severity:** P1
- **Module:** `techno-kol-ops/client/src/pages/360/shared360.tsx`
- **Fix:** Drop the hardcoded `+ ` prefix in line 73; let callers prepend their own icon (e.g., `📩` for send, `✓` for approve, `+` for create) via an `icon?: string` prop.

### UX-007 — No "Next recommended action" anywhere except features/customers Customer360
- **Description:** CLAUDE.md "No Dead Pages Rule" requires every page to answer "Next step?". The only place this is computed is `onyx-procurement/src/features/customers/Customer360.tsx:441` (`nextBestAction`). The 8 ops 360 pages do not surface a recommended next action.
- **Steps:** Open a Quote in `Sent` state with no related project → no hint that "Convert to project" is the obvious next move.
- **Actual:** User has to know the workflow themselves to pick the next action.
- **Expected:** Each 360 should compute a next-best-action from `state-machines.js` transitions and surface it in a yellow callout under the header, e.g. "צעד הבא: הצעה במצב Sent — המר לפרויקט אם הלקוח אישר".
- **Severity:** P1
- **Module:** all `techno-kol-ops/client/src/pages/360/*.tsx`
- **Fix:** Add a `NextActionHint` component to `shared360.tsx` that takes `entity`, `state`, and a small map; or pull it from `GET /api/state-machines/:type/transitions?current=X`.

### UX-008 — Loading state shows only static Hebrew text, no skeleton
- **Description:** `shared360.tsx:154-156` `Loader` renders one short pulsing line. On a slow Supabase RPC (e.g. Project360's `get_project_360_fast` which fans out 16 tables), the user stares at "טוען פרויקט..." for 2-5 seconds with zero structure preview.
- **Steps:** Throttle network → open `/360/project/1`.
- **Actual:** Layout shifts dramatically when content arrives because nothing reserved space. Header, KPIs, tables all pop in at once.
- **Expected:** Skeleton placeholders (gray rounded blocks) matching the final layout — header height, 4 KPI cards, table rows. `features/customers/Customer360.tsx:264` already implements `PageLoading` with `animate-pulse` boxes; reuse that pattern.
- **Severity:** P1
- **Module:** `techno-kol-ops/client/src/pages/360/shared360.tsx`
- **Fix:** Replace `Loader` with a `Skeleton360` that renders header + 4 KPI placeholders + 2 table placeholders.

### UX-009 — Error messages dump raw backend strings to the user
- **Description:** `shared360.tsx:158` `ErrCard` renders `שגיאה: {msg}` where `msg` comes straight from Supabase / orchestrator (e.g. `permission denied for relation customers`, `relation "get_quote_360_fast" does not exist`, `JWT expired`). For runAction failures (`Quote360.tsx:43`) the user sees `אישור הצעה נכשל: 401 Unauthorized`.
- **Steps:** Trigger any orchestrator error.
- **Actual:** Hebrew + English + technical terms mixed together. End users (sales, ops staff, contractors) cannot self-recover.
- **Expected:** Map known error categories to plain Hebrew with a "what to do" line. Only show raw text in a collapsible "פרטים טכניים" details element.
- **Severity:** P1
- **Module:** `techno-kol-ops/client/src/pages/360/shared360.tsx`, `lib/api-client.ts`
- **Fix:** Build an `errorMessageHe(error)` helper. Common mappings: 401 → "ההתחברות פגה — היכנס שוב"; 403 → "אין לך הרשאה לפעולה זו — פנה למנהל"; 5xx → "תקלה בשרת — נסה שוב בעוד מספר שניות".

### UX-010 — RelatedTable silently truncates at 20 rows with no indicator or "show more"
- **Description:** `shared360.tsx:111` `rows.slice(0, limit)` with default `limit = 20`. The header shows `(${rows.length})`, so a project with 47 work orders shows "הזמנות עבודה (47)" but only renders 20 rows. There is no "+27 more" link and no pagination.
- **Steps:** Open a project with > 20 work orders.
- **Actual:** User sees "47" but the table ends at row 20. They scroll, get nothing, and assume the data is corrupt.
- **Expected:** Either render all rows behind a `react-window` virtualizer, or show a "הצג את כל ה-47" footer link that navigates to the filtered list page (e.g. `/work-orders?project_id=X`).
- **Severity:** P1
- **Module:** `techno-kol-ops/client/src/pages/360/shared360.tsx`
- **Fix:** Add a footer when `rows.length > limit`: `<button onClick={() => navigate(viewAllUrl)}>הצג את כל ה-{rows.length}</button>`. Pass `viewAllUrl` from each consumer.

### UX-011 — Status badge color map missing many states defined in state-machines
- **Description:** `shared360.tsx:38-49` `StatusBadge` only knows about Active/Open/InProgress/Approved/Sent/Closed/Cancelled/Draft/Issued. State machines define 91 transitions across many more states (e.g. `Submitted`, `UnderReview`, `Acknowledged`, `Reserved`, `PartiallyReceived`, `OnHold`, `QualityHold`, `Disputed`, `Reconciled`, `Posted`, `Paid`). Unknown states fall through to the gray Draft color, making "QualityHold" and "Posted" indistinguishable.
- **Steps:** Open a PO with state `PartiallyReceived`.
- **Actual:** Badge looks like "Draft" — gray.
- **Expected:** A semantic palette: in-progress = blue, pending-action = amber, blocked = red, completed = green, cancelled = strikethrough red, neutral = gray. All 91 states must map to one bucket.
- **Severity:** P1
- **Module:** `techno-kol-ops/client/src/pages/360/shared360.tsx`
- **Fix:** Replace the dictionary with a function `stateCategory(state)` driven by `state-machines.js` metadata, then color by category.

### UX-012 — KPI cards do not link to detail or filter views
- **Description:** Customer360 KPI "הצעות מחיר 12" is a static `<div>` (`shared360.tsx:58-66`). The user wants to see the 12; the natural affordance is to click the card.
- **Steps:** Open Customer360 → click on the "הצעות מחיר 12" card.
- **Actual:** Nothing. The card is not interactive. The user has to scroll down to the quotes table or remember the menu path to "Quotes" filtered by customer.
- **Expected:** KPIs that correspond to a filterable list act as hyperlinks: clicking "הצעות מחיר 12" jumps to the quotes tab (after UX-002 fix) or to `/quotes?customer_id=X`.
- **Severity:** P2
- **Module:** `techno-kol-ops/client/src/pages/360/shared360.tsx`
- **Fix:** Add optional `onClick?: () => void` to `KPI`; render `cursor: pointer` and underline-on-hover when present.

### UX-013 — AlertCenter "סגור" button labeled like a destructive close, not a resolve
- **Description:** `AlertCenter.tsx:54` button reads `✓ סגור` (close). Hebrew "סגור" reads as "close (the panel)" or "shut down". The action actually marks the alert as resolved and updates audit log.
- **Steps:** A user sees an open alert "Inventory low: Material X" → wants to dismiss it visually but keep tracking → clicks "סגור".
- **Actual:** The alert is permanently resolved server-side, audit logged.
- **Expected:** Clear verb: "סמן כטופל" (mark as handled) or "סגור התראה" (close alert). Add a confirmation step for Critical severity.
- **Severity:** P2
- **Module:** `techno-kol-ops/client/src/pages/AlertCenter.tsx`
- **Fix:** Change label to "סמן כטופל". For `severity === "critical"`, wrap the click in a `confirm("התראה קריטית — לסמן כטופל?")`.

### UX-014 — Pipeline page uses 19 emoji-bearing stages with no legend, screen-reader hostile
- **Description:** `Pipeline.tsx:5-25` has 19 stages each with an emoji (`🤝`, `📐`, `✍️`, `📦`, `⚙️`, `🏗️`, `🚚`, `🎨`, `🔧`, `⭐`, `💳`, `💰`, `🏆`). Many emojis render differently on Windows vs. macOS, and screen readers announce each as raw Unicode names ("handshake medium-light skin tone", "clipboard").
- **Steps:** Use the page with VoiceOver / NVDA.
- **Actual:** Each stage announces emoji name + Hebrew label. Mixed-direction announcement is jarring.
- **Expected:** Use SVG icons with `aria-hidden="true"` plus the Hebrew label as the accessible name.
- **Severity:** P2
- **Module:** `techno-kol-ops/client/src/pages/Pipeline.tsx`
- **Fix:** Replace emojis with `lucide-react` icons. Wrap each stage label so screen readers only announce the Hebrew text.

### UX-015 — Dashboard "Live" badge animates with no off-switch and no explanation
- **Description:** `Dashboard.tsx:65-78` always renders a green `● חי` / red `○ מנותק` indicator with a glowing box-shadow. There is no tooltip explaining what "live" means, and users on flaky Wi-Fi will see the indicator flap every few seconds.
- **Steps:** Open the dashboard on an unstable connection.
- **Actual:** Indicator flashes between green and red every 2-5 seconds. The user worries the system is broken.
- **Expected:** Debounce flips (≥10s of disconnection before showing red). Add a tooltip "WebSocket מחובר — KPIs מתעדכנים בזמן אמת" / "מחובר מחדש...".
- **Severity:** P2
- **Module:** `techno-kol-ops/client/src/pages/Dashboard.tsx`
- **Fix:** Wrap state in a debounced setter; add `title=` attribute. On hover show last-event-received timestamp.

### UX-016 — Currency formatting inconsistent across 360 pages
- **Description:** Some pages use `₪${Number(x).toLocaleString()}` (no decimals, no rounding for ints, e.g. PO360:64), some use `formatMoney()` from a custom currencyFormatter (Customer360 procurement variant uses `Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 })`), some show `formatCurrency()` (Dashboard via `utils/format`). Sub-shekel amounts (12.50) render as `₪12` here, `₪12.50` there, and `12.5 ₪` elsewhere depending on which page the user opens.
- **Steps:** Open Quote360 (sees `₪12,500`), then Customer360 procurement (sees `₪12,500` formatted via Intl), then Finance360 (`₪${...toLocaleString()}`).
- **Actual:** Same number, three displays. Trust erodes.
- **Expected:** A single `lib/format/money.ts` with `formatILS(value, { decimals = 0, sign = true })` consumed everywhere. Round-half-even, separator dots, `₪` prefix in RTL.
- **Severity:** P1
- **Module:** `techno-kol-ops/client/src/pages/360/*.tsx`, `utils/format.ts`, `onyx-procurement/.../Customer360.tsx`
- **Fix:** Create one helper. Replace all inline currency calls. Add a unit test for negative numbers, zero, and missing values.

### UX-017 — Date display mixes ISO and locale formats unpredictably
- **Description:** Project360 KPI shows `valid_until ?? "—"` raw (e.g. `2026-05-12`). Customer360 procurement uses `formatDate` (`he-IL` locale → `12.5.2026`). Audit log uses `performed_at?.slice(0, 16)?.replace("T", " ")` (`2026-04-29 14:32`). Three formats on one screen.
- **Steps:** Open Project360 with both KPIs and audit log visible.
- **Actual:** "תאריך תוקף 2026-05-12" next to audit "2026-04-29 14:32" next to header "עודכן: 29.4.2026, 14:32".
- **Expected:** One format per context: dates as `DD/MM/YYYY` in Hebrew locale, datetimes as `DD/MM/YYYY HH:mm`. Future dates relative ("בעוד 13 ימים") on hover.
- **Severity:** P2
- **Module:** all 360 pages
- **Fix:** Centralize `formatDateHe()` and `formatDateTimeHe()`. Forbid raw ISO display via lint rule.

### UX-018 — Customer360 (procurement) action buttons label themselves "צור הצעת מחיר" with no confirmation, then jump to a generated record
- **Description:** `features/customers/Customer360.tsx:418` calls `createQuoteForCustomer` immediately on click. Body sends only `{ customer_id, quote_date }`. There is no draft step, no confirmation, no field for amount or items. Returns a quote with empty lines.
- **Steps:** Click "צור הצעת מחיר" by accident → an empty quote `Q-2026-N` is created with no items, no value.
- **Actual:** Customer's audit log now contains a phantom quote. There is no "delete" action visible on the page.
- **Expected:** Button should navigate to `/quotes/new?customer_id=X` (a draft form), not POST silently. Or open a modal asking "כמה שורות?" and only create on confirm.
- **Severity:** P1
- **Module:** `onyx-procurement/src/features/customers/Customer360.tsx`
- **Fix:** Replace the mutation with `navigate(/quotes/new?customer_id=X)`. Move the silent-create behind a "צור טיוטה ריקה" secondary option.

### UX-019 — Audit log shows raw `action_name` slugs with no human translation
- **Description:** `shared360.tsx:142` audit row shows `{a.action_name}` directly. Backend emits machine codes like `customer.create`, `quote.convert_to_project`, `po.receive_items`. End users see English snake_case in the middle of an otherwise Hebrew page.
- **Steps:** Open any 360 → scroll to "יומן פעילות".
- **Actual:** "29.4.2026 14:32 quote.convert_to_project יוסי כהן".
- **Expected:** "29.4.2026 14:32 המרה לפרויקט יוסי כהן" plus tooltip with the slug for ops debugging.
- **Severity:** P2
- **Module:** `techno-kol-ops/client/src/pages/360/shared360.tsx`
- **Fix:** Build `actionLabelHe(slug)` map driven by `orchestrator.js` action definitions. Fall back to slug if missing.

### UX-020 — No breadcrumb on `pages/360/Customer360.tsx`, `Supplier360.tsx`, `Employee360.tsx`, `Finance360.tsx`, `RFQ360.tsx`
- **Description:** Quote360, Project360, WorkOrder360, PO360 do compute and pass a `breadcrumbs` prop to `Page360`. Customer360, Supplier360, Employee360, Finance360, RFQ360 do not. The user opening a customer from a deep search has no way back to "Customers list".
- **Steps:** Search → click a customer result → open Customer360 → try to navigate back to the customer list.
- **Actual:** Browser back button is the only path. No "בית › לקוחות › X" trail.
- **Expected:** All 9 master 360 pages should expose breadcrumbs. The shared component already supports it (`shared360.tsx:21-23`); just thread the prop.
- **Severity:** P2
- **Module:** `techno-kol-ops/client/src/pages/360/Customer360.tsx`, `Supplier360.tsx`, `Employee360.tsx`, `Finance360.tsx`, `RFQ360.tsx`
- **Fix:** Add `breadcrumbs={[{label:"בית",to:"/"},{label:"לקוחות",to:"/clients"},{label: c.customer_name}]}` (and equivalents) on each.

---

## Cross-cutting summary

- **Spec compliance is partial:** 0 of 8 ops-side 360 pages implement the tab structure required by `wiring-spec.js § PAGE_CONTRACTS`; 3 of 9 pages have action buttons that are no-ops or absent. 4 of 9 are missing breadcrumbs. The Onyx-side Customer360 is the only page that approaches the full contract.
- **No-Dead-Pages compliance:** Every 360 page answers "Where am I?" (header) and "What is this?" (subtitle/KPIs) and "Current status?" (badge). Most fail "What can I do?" (incomplete actions per UX-005, UX-003, UX-004) and "Next step?" (only one page computes next-best-action — UX-007).
- **Consistency debt:** Two Customer360 implementations (UX-001), three currency formats (UX-016), three date formats (UX-017), inconsistent badge palettes (UX-011), `+ ` prefix on every action (UX-006).
- **Error UX:** Loading state is a single line with no skeleton (UX-008); errors leak raw backend strings (UX-009); resolved state for alerts uses ambiguous "סגור" verb (UX-013).
- **A11y:** Pipeline emojis are screen-reader noise (UX-014); KPI cards lack interactive affordance (UX-012).

---

## Recommended P0 fix order

1. UX-001 — collapse the two Customer360 implementations into one (architectural blocker).
2. UX-003 — wire RFQ360 buttons to orchestrator (broken core flow: Sales → Procurement).
3. UX-004 — wire Employee360 buttons to orchestrator (broken core flow: Workforce → Payroll).
4. UX-005 — add Finance360 actions (broken core flow: Invoice → Payment → Cash).
5. UX-002 — convert all 8 ops 360 pages to tabbed layout per `PAGE_CONTRACTS`.

After P0, batch UX-006, UX-008, UX-009, UX-010, UX-011, UX-016 as one "shared360 polish" PR — they all touch the same file.
