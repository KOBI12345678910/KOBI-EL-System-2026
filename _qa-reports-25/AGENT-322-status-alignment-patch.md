# AGENT-322 — Status Alignment Patch (Pipeline Files)

**Branch:** `claude/objective-merkle-40ff93`
**Date:** 2026-04-29
**Trigger:** Copilot review on PR #63 flagged status name divergence across pipeline files.
**Canonical source:** `state-machines.js` (per AGENT-16).

---

## 1. Executive Summary

Three entities have status names that diverge between `state-machines.js` (canonical) and the descriptive maps in `entity-map.js`, `pipeline-engine.js`, and `wiring-spec.js`:

| Entity | Canonical (state-machines.js) | Divergence in other files |
|--------|------------------------------|----------------------------|
| **project** | `draft, approved, in_planning, in_procurement, in_execution, in_delivery, completed, closed, cancelled` | `entity-map.js`, `pipeline-engine.js` use `in_production` instead of (or in addition to) `in_execution` |
| **rfq** | `draft, sent, quotes_received, under_comparison, approved, rejected, converted_to_po` | `entity-map.js` uses `decided` (not in canonical), missing `under_comparison`, `converted_to_po`, `approved`. `wiring-spec.js` POSTs `/api/rfq/:id/decide` |
| **work_order** | `open, assigned, waiting_materials, in_progress, qa, completed, signed_off, cancelled` | `entity-map.js`, `pipeline-engine.js` use `qa_check` and `done`. `wiring-spec.js` PATCHes `body: { status: 'done' }` |

The decision per AGENT-16 is to **treat `state-machines.js` as the single source of truth** and align everything else.

---

## 2. Findings (file-by-file)

### 2.1 `entity-map.js`

**Line 123 — rfq.statuses:**
```js
statuses: ['draft', 'sent', 'quotes_received', 'decided', 'cancelled'],
```
Canonical (state-machines.js:126-132): `draft, sent, quotes_received, under_comparison, approved, rejected, converted_to_po`.
`decided` is non-canonical; `cancelled` is not in the state machine; `under_comparison`, `approved`, `rejected`, `converted_to_po` are missing.

**Line 127 — rfq.nextSteps:**
```js
{ id: 'approve', label: 'אשר בחירה', icon: '✅', targetStatus: 'decided' },
```
Should target `approved` (canonical transition `under_comparison → approved`).

**Line 171 — project.statuses:**
```js
statuses: ['draft', 'approved', 'in_planning', 'in_procurement', 'in_production', 'in_delivery', 'completed', 'closed'],
```
Canonical (state-machines.js:174-184): uses `in_execution`, not `in_production`. `cancelled` is also missing.

**Line 175 — project.nextSteps:**
```js
{ id: 'start_production', label: 'התחל ייצור', icon: '🏗️', targetStatus: 'in_production' },
```
Should target `in_execution`.

**Line 201 — work_order.statuses:**
```js
statuses: ['open', 'assigned', 'in_progress', 'waiting_materials', 'qa_check', 'done', 'signed_off'],
```
Canonical (state-machines.js:219-227): uses `qa` (not `qa_check`), `completed` (not `done`). `cancelled` missing.

**Lines 205-206 — work_order.nextSteps:**
```js
{ id: 'qa', label: 'בדיקת איכות', icon: '🔍', targetStatus: 'qa_check' },
{ id: 'complete', label: 'סמן כהושלם', icon: '✅', targetStatus: 'done' },
```
Should target `qa` and `completed`.

### 2.2 `pipeline-engine.js`

**Line 56:** `project: ['draft', 'approved', 'in_planning', 'in_procurement', 'in_production', 'in_delivery', 'completed', 'closed'],`
**Line 57:** `workOrder: ['open', 'assigned', 'in_progress', 'waiting_materials', 'qa_check', 'done', 'signed_off'],`

Same divergence as entity-map.js. Also `pipeline-engine.js:129` uses `qa_check` as a stage label, and `:261` references `qa_check` as an action.

### 2.3 `wiring-spec.js`

**Line 177:** `'rfq.approve': { method: 'POST', path: '/api/rfq/:id/decide' },`
The HTTP path `/decide` is consistent with the divergent `decided` status. Aligning to canonical means the path becomes `/approve`.

**Line 202:** `'work_order.complete': { method: 'PATCH', path: '/api/work-orders/:id/status', body: { status: 'done' } },`
Body should be `{ status: 'completed' }`.

### 2.4 Cascade impact (other files referencing these names)

- `orchestrator.js:82` already uses `in_production` (project precondition) — must change to `in_execution`.
- `orchestrator.js:122` already uses `decided` (rfq precondition) — must change to `approved` (or both during transition).
- `pipeline-engine.js:129, :261` use `qa_check` as a stage/action label — change to `qa`.
- `state-machines.js:65-66, 114` use `in_production` for **`sales_order`** entity (NOT `project`). This is a **different** entity and `in_production` is the correct canonical value there per migration 00084. **Do NOT change** sales_order.

---

## 3. Canonical Choice (per AGENT-16)

`state-machines.js` is the source of truth for status names because:

1. It is the only file with executable transition logic + side-effect triggers.
2. It is enforced by `state-enforcement.js` and the DB-layer guard trigger from migration 00084.
3. AGENT-16 designated it the canonical machine.
4. The other files (`entity-map.js`, `pipeline-engine.js`, `wiring-spec.js`) are descriptive (UI/API mapping) and must mirror the machine.

---

## 4. Unified Diff (proposed patch)

```diff
diff --git a/onyx-procurement/src/pipeline/entity-map.js b/onyx-procurement/src/pipeline/entity-map.js
index aaaaaaa..bbbbbbb 100644
--- a/onyx-procurement/src/pipeline/entity-map.js
+++ b/onyx-procurement/src/pipeline/entity-map.js
@@ -120,12 +120,12 @@ const ENTITY_MAP = {
     label: 'בקשת הצעת מחיר', labelEn: 'RFQ', icon: '📨', service: 'procurement',
     purpose: 'בקשת הצעת מחיר מספקים',
     links: ['supplier', 'pricing', 'approval', 'supplier_quote', 'po', 'document'],
-    statuses: ['draft', 'sent', 'quotes_received', 'decided', 'cancelled'],
+    statuses: ['draft', 'sent', 'quotes_received', 'under_comparison', 'approved', 'rejected', 'converted_to_po'],
     nextSteps: [
       { id: 'send_to_suppliers',label: 'שלח לספקים',         icon: '📤', targetStatus: 'sent' },
-      { id: 'compare_quotes',  label: 'השווה הצעות',        icon: '⚖️' },
-      { id: 'approve',         label: 'אשר בחירה',          icon: '✅', targetStatus: 'decided' },
-      { id: 'convert_to_po',   label: 'צור הזמנת רכש',      icon: '🛒', creates: 'po' },
+      { id: 'compare_quotes',  label: 'השווה הצעות',        icon: '⚖️', targetStatus: 'under_comparison' },
+      { id: 'approve',         label: 'אשר בחירה',          icon: '✅', targetStatus: 'approved' },
+      { id: 'convert_to_po',   label: 'צור הזמנת רכש',      icon: '🛒', creates: 'po', targetStatus: 'converted_to_po' },
     ],
@@ -168,11 +168,11 @@ const ENTITY_MAP = {
     purpose: 'יחידת הביצוע המרכזית',
     links: ['customer', 'quote', 'contract', 'work_order', 'po', 'inventory_reservation', 'material_request', 'expense', 'employee_assignment', 'task', 'logistics_order', 'invoice', 'payment', 'report', 'forecast', 'document', 'alert', 'audit_log'],
-    statuses: ['draft', 'approved', 'in_planning', 'in_procurement', 'in_production', 'in_delivery', 'completed', 'closed'],
+    statuses: ['draft', 'approved', 'in_planning', 'in_procurement', 'in_execution', 'in_delivery', 'completed', 'closed', 'cancelled'],
     nextSteps: [
       { id: 'start_planning',    label: 'התחל תכנון',         icon: '📐', targetStatus: 'in_planning' },
       { id: 'start_procurement', label: 'התחל רכש',           icon: '🛒', targetStatus: 'in_procurement' },
-      { id: 'start_production',  label: 'התחל ייצור',         icon: '🏗️', targetStatus: 'in_production' },
+      { id: 'start_execution',   label: 'התחל ביצוע',         icon: '🏗️', targetStatus: 'in_execution' },
       { id: 'start_delivery',    label: 'התחל אספקה',         icon: '🚚', targetStatus: 'in_delivery' },
       { id: 'complete',          label: 'סמן כהושלם',         icon: '✅', targetStatus: 'completed' },
       { id: 'close',             label: 'סגור פרויקט',        icon: '🔒', targetStatus: 'closed' },
@@ -198,12 +198,12 @@ const ENTITY_MAP = {
     label: 'הזמנת עבודה', labelEn: 'Work Order', icon: '🔧', service: 'ops',
     purpose: 'יחידת עבודה תפעולית',
     links: ['project', 'material_request', 'inventory_reservation', 'employee_assignment', 'attendance', 'task', 'quality_check', 'signature', 'expense'],
-    statuses: ['open', 'assigned', 'in_progress', 'waiting_materials', 'qa_check', 'done', 'signed_off'],
+    statuses: ['open', 'assigned', 'waiting_materials', 'in_progress', 'qa', 'completed', 'signed_off', 'cancelled'],
     nextSteps: [
       { id: 'assign',    label: 'שבץ עובדים',         icon: '👷', targetStatus: 'assigned' },
       { id: 'start',     label: 'התחל ביצוע',         icon: '▶️', targetStatus: 'in_progress' },
-      { id: 'qa',        label: 'בדיקת איכות',        icon: '🔍', targetStatus: 'qa_check' },
-      { id: 'complete',  label: 'סמן כהושלם',         icon: '✅', targetStatus: 'done' },
+      { id: 'qa',        label: 'בדיקת איכות',        icon: '🔍', targetStatus: 'qa' },
+      { id: 'complete',  label: 'סמן כהושלם',         icon: '✅', targetStatus: 'completed' },
       { id: 'signoff',   label: 'חתימה וסגירה',       icon: '✍️', targetStatus: 'signed_off' },
     ],

diff --git a/onyx-procurement/src/pipeline/pipeline-engine.js b/onyx-procurement/src/pipeline/pipeline-engine.js
index ccccccc..ddddddd 100644
--- a/onyx-procurement/src/pipeline/pipeline-engine.js
+++ b/onyx-procurement/src/pipeline/pipeline-engine.js
@@ -53,8 +53,8 @@ const ENTITY_STATUSES = {
   quote:      ['draft', 'sent', 'under_review', 'approved', 'rejected', 'converted'],
   po:         ['draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'fully_received', 'closed'],
-  project:    ['draft', 'approved', 'in_planning', 'in_procurement', 'in_production', 'in_delivery', 'completed', 'closed'],
-  workOrder:  ['open', 'assigned', 'in_progress', 'waiting_materials', 'qa_check', 'done', 'signed_off'],
+  project:    ['draft', 'approved', 'in_planning', 'in_procurement', 'in_execution', 'in_delivery', 'completed', 'closed', 'cancelled'],
+  workOrder:  ['open', 'assigned', 'waiting_materials', 'in_progress', 'qa', 'completed', 'signed_off', 'cancelled'],
   invoice:    ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'],
   payroll:    ['draft', 'calculated', 'approved', 'exported', 'paid'],
 };
@@ -126,7 +126,7 @@ const ENTITY_PAGES = {
       { id: 'open',             label: 'פתוח',             icon: '🟢' },
       { id: 'assigned',         label: 'שובץ',             icon: '👤' },
       { id: 'in_progress',      label: 'בביצוע',           icon: '⏳' },
-      { id: 'qa_check',         label: 'בדיקת איכות',      icon: '🔍' },
+      { id: 'qa',               label: 'בדיקת איכות',      icon: '🔍' },
       { id: 'signed_off',       label: 'נחתם',             icon: '✅' },
     ],
@@ -258,7 +258,7 @@ const PIPELINE_RULES = {
   {
     trigger: 'work_order.completed',
-    actions: ['update_project_progress', 'calculate_costs', 'check_delivery_ready', 'qa_check'],
+    actions: ['update_project_progress', 'calculate_costs', 'check_delivery_ready', 'qa'],
   },

diff --git a/onyx-procurement/src/pipeline/wiring-spec.js b/onyx-procurement/src/pipeline/wiring-spec.js
index eeeeeee..fffffff 100644
--- a/onyx-procurement/src/pipeline/wiring-spec.js
+++ b/onyx-procurement/src/pipeline/wiring-spec.js
@@ -174,7 +174,7 @@ const ACTION_API_MAP = {
   // RFQ actions
   'rfq.send_to_suppliers':    { method: 'POST', path: '/api/rfq/:id/send' },
   'rfq.compare_quotes':       { method: 'GET',  path: '/api/rfq/:id/compare' },
-  'rfq.approve':              { method: 'POST', path: '/api/rfq/:id/decide' },
+  'rfq.approve':              { method: 'POST', path: '/api/rfq/:id/approve' },
   'rfq.convert_to_po':        { method: 'POST', path: '/api/purchase-orders',  body: { fromRfq: ':rfqId' } },
@@ -199,7 +199,7 @@ const ACTION_API_MAP = {
   'work_order.start':         { method: 'PATCH',path: '/api/work-orders/:id/status', body: { status: 'in_progress' } },
   'work_order.qa_check':      { method: 'POST', path: '/api/quality-checks',   body: { workOrderId: ':woId' } },
-  'work_order.complete':      { method: 'PATCH',path: '/api/work-orders/:id/status', body: { status: 'done' } },
+  'work_order.complete':      { method: 'PATCH',path: '/api/work-orders/:id/status', body: { status: 'completed' } },
   'work_order.signoff':       { method: 'POST', path: '/api/signatures',       body: { workOrderId: ':woId' } },

diff --git a/onyx-procurement/src/pipeline/orchestrator.js b/onyx-procurement/src/pipeline/orchestrator.js
index ggggggg..hhhhhhh 100644
--- a/onyx-procurement/src/pipeline/orchestrator.js
+++ b/onyx-procurement/src/pipeline/orchestrator.js
@@ -79,7 +79,7 @@
   {
     id: 'project.start_execution',
-    preconditions: [{ check: 'entity_exists', entity: 'project' }, { check: 'status_in', statuses: ['approved', 'in_planning', 'in_procurement', 'in_production'] }],
+    preconditions: [{ check: 'entity_exists', entity: 'project' }, { check: 'status_in', statuses: ['approved', 'in_planning', 'in_procurement', 'in_execution'] }],
@@ -119,7 +119,7 @@
   {
     id: 'rfq.convert_to_po',
-    preconditions: [{ check: 'entity_exists', entity: 'rfq' }, { check: 'status_in', statuses: ['approved', 'decided'] }],
+    preconditions: [{ check: 'entity_exists', entity: 'rfq' }, { check: 'status_in', statuses: ['approved'] }],
```

---

## 5. Server-side route alias (recommended for backward compatibility)

The route `POST /api/rfq/:id/decide` may have live callers (UI, integration, tests). Add a 308 redirect or a parallel handler in the RFQ router for **one release cycle**, then remove:

```js
// onyx-procurement/src/routes/rfq.js (or equivalent)
app.post('/api/rfq/:id/decide', (req, res, next) => {
  // Deprecated alias — see AGENT-322. Remove in v2.next+1.
  req.url = `/api/rfq/${req.params.id}/approve`;
  next('route');
});
```

Likewise for `body: { status: 'done' }` on `PATCH /api/work-orders/:id/status` — accept `done` as an alias for `completed` and emit a deprecation log, then remove.

---

## 6. Cancelled status — secondary observation

Three machines (`project`, `work_order`, `sales_order`) include `cancelled` as a final state in `state-machines.js`, but `entity-map.js` and `pipeline-engine.js` omit it from the `statuses` array. The diff above adds it back for `project` and `work_order`. Reviewers should confirm if `cancelled` UI badges and a `cancel` next-step should also be added (currently no UI surface offers this transition).

---

## 7. Migration risk & test plan

| Area | Risk | Mitigation |
|------|------|------------|
| DB rows with `status='in_production'` for projects | High — DB-layer guard from 00084 only constrains `sales_order`, not `project`, so existing values may persist | Write migration `00085_align_project_status` to UPDATE `project.status='in_production' → 'in_execution'`; same for `work_order.status IN ('done','qa_check')` |
| API consumers calling `/api/rfq/:id/decide` | Medium | Keep alias for one release (section 5) |
| Frontend code referencing `decided`, `done`, `qa_check`, `in_production` | Medium | Grep frontend for these literals; replace; add lint rule (`no-restricted-syntax`) banning the deprecated names |
| Audit log historic entries | Low (read-only) | Leave as-is; document the rename in audit-log render layer |

**Acceptance tests:**
1. `GET /api/state-machines/project` → states must equal `entity-map.statuses['project']` exactly.
2. `GET /api/state-machines/rfq` → states must equal `entity-map.statuses['rfq']` exactly.
3. `GET /api/state-machines/work_order` → states must equal `entity-map.statuses['work_order']` exactly.
4. New CI lint: assert the three arrays match the keys of `STATE_MACHINES[entity].states`.

---

## 8. Files touched by the patch

| File | Lines changed | Purpose |
|------|---------------|---------|
| `onyx-procurement/src/pipeline/entity-map.js` | 123, 127, 128, 171, 175, 201, 205, 206 | Align rfq, project, work_order statuses + nextSteps |
| `onyx-procurement/src/pipeline/pipeline-engine.js` | 56, 57, 129, 261 | Align project, workOrder statuses + qa label/action |
| `onyx-procurement/src/pipeline/wiring-spec.js` | 177, 202 | `/decide` → `/approve`, `'done'` → `'completed'` |
| `onyx-procurement/src/pipeline/orchestrator.js` | 82, 122 | Align project precondition + rfq precondition |
| `onyx-procurement/migrations/00085_align_project_status.sql` (new) | — | Backfill UPDATE for existing DB rows |
| Frontend (TBD) | grep + replace | UI literals referencing old names |

---

## 9. Recommendation

Apply the unified diff in section 4 in **one PR**, with the migration in section 7, the alias from section 5 (time-boxed for one release), and a CI lint asserting parity between `STATE_MACHINES` and `ENTITY_MAP.statuses`. This brings all three entities into alignment with the canonical state machine and prevents future drift.

**Out of scope (follow-up):**
- Adding `cancel` next-step + cancelled badges to UI for project/work_order.
- Deduplicating `ENTITY_STATUSES` from `pipeline-engine.js` entirely (it is now a redundant copy of `STATE_MACHINES[*].states` keys; serve from one source).

---

*Authored by Agent 322 — `claude/objective-merkle-40ff93`.*
