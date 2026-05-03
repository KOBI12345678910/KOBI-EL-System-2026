# AGENT-275 — LOGIC #5: PO Approval Matrix Wiring

**Agent:** 275 — LOGIC #5
**Date:** 2026-04-29
**Owner Service:** ONYX_PROCUREMENT (3100)
**Source:** Agent 100/183 — `po/approval-matrix.js` flagged as DEAD CODE
**Status:** WIRING SPEC + CONCRETE CODE

---

## 1. Problem

`onyx-procurement/src/po/approval-matrix.js` is a 1,120-line, fully-functional approval engine (Agent X-38) with `evaluatePO()`, bracket routing, parallel emergency mode, delegation, escalation, amendment workflow — and **zero inbound `require()`s anywhere in the repo**. Confirmed: `grep -rn "require.*approval-matrix" onyx-procurement/src/` returns 0 hits.

Result: every PO bypasses the matrix. Brackets, SLA escalation, emergency ratification, and audit trail are all unreachable.

---

## 2. Required Behaviour (already coded in matrix, just needs wiring)

| Capability | Source rule | Where in matrix |
|---|---|---|
| Amount-bracket routing (5 tiers) | `R2*` | lines 313-346 |
| Capex board review > ₪50k | `R3` | line 349-354 |
| Vendor risk tier C/D | `R5`,`R6` | lines 365-391 |
| Emergency parallel + 48h ratify | `R8` | lines 411-422 |
| SLA timeout escalation (24h/step) | `tick()` | lines 935-970 |
| Email + WhatsApp notify | `notifier(event)` hook | uninjected |

The matrix exposes DI for `notifier`, `audit`, `budget`, `vendor`, `dupDetector`, `clock`. We must wire all of these.

Bracket map: `≤₪1k` auto / `1k-5k` manager / `5k-25k` mgr→head / `25k-100k` mgr→head→CFO / `>100k` mgr→head→CFO→CEO.

---

## 3. Wiring Plan — 4 Files

| # | File | Role |
|---|---|---|
| 1 | `onyx-procurement/src/po/approval-system.js` | Singleton factory — injects deps |
| 2 | `onyx-procurement/src/po/approval-routes.js` | Express routes |
| 3 | `onyx-procurement/src/po/approval-sla-tick.js` | Background SLA ticker |
| 4 | `onyx-procurement/src/po/approval-notifier.js` | Email + WhatsApp emitter |

Orchestrator action `po.submit_for_approval` calls into file #1.

---

## 4. File 1 — `approval-system.js` (Singleton Factory)

```javascript
'use strict';
const { createApprovalSystem } = require('./approval-matrix');
const { buildApprovalNotifier } = require('./approval-notifier');
const { getDb } = require('../db');
const vendorService = require('../vendors/vendor-service');
const budgetService = require('../budget/budget-service');
const auditService  = require('../audit/audit-service');

let _instance = null;
function getApprovalSystem() {
  if (_instance) return _instance;
  const db = getDb();
  const notifier = buildApprovalNotifier();

  _instance = createApprovalSystem({
    clock: () => Date.now(),
    notifier: (event) => notifier.emit(event),
    audit: (entry) => auditService.append({
      domain: 'po_approval', tenant_id: entry.tenant_id || null, payload: entry,
    }),
    rbac: {
      userHasRole: (uid, role) => db.queryOne(
        'SELECT 1 FROM governance.user_roles WHERE user_id=$1 AND role=$2',
        [uid, role]).then(Boolean),
    },
    budget: { checkBudget: (po) => budgetService.checkBudget({
      tenant_id: po.tenant_id, department: po.department,
      amount: po.amount, period: po.period || 'current',
    })},
    vendor: { getStatus: (vid) => vendorService.getStatus(vid) },
    dupDetector: (po, days) =>
      vendorService.findDuplicatePO(po.vendor_id, po.items, days),
    department_manager_of: (dept) => db.queryScalar(
      'SELECT manager_user_id FROM governance.departments WHERE code=$1', [dept]),
    stepTimeoutMs: 24 * 60 * 60 * 1000,   // 24h SLA
  });
  return _instance;
}
module.exports = { getApprovalSystem };
```

---

## 5. File 2 — `approval-routes.js`

```javascript
'use strict';
const express = require('express');
const { getApprovalSystem } = require('./approval-system');
const { requireTenant } = require('../middleware/requireTenant');
const { requireAuth }   = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth, requireTenant);

router.post('/api/po/:id/submit-for-approval', (req, res) => {
  try {
    const requestId = getApprovalSystem().submitForApproval(req.params.id, {
      submitter: req.user.id, context: { tenant_id: req.tenant.id },
    });
    res.json({ ok: true, request_id: requestId });
  } catch (err) {
    res.status(err.code === 'E_BUDGET_EXCEEDED' ? 422 :
              err.code === 'E_VENDOR_COMPLIANCE' ? 422 :
              err.code === 'E_DUPLICATE_PO' ? 409 :
              err.code === 'E_BLOCKED' ? 403 : 500)
       .json({ ok: false, code: err.code, message: err.message });
  }
});

router.post('/api/po-requests/:requestId/decide', (req, res) => {
  const { decision, comment } = req.body;
  try {
    const result = getApprovalSystem().approve(
      req.params.requestId, req.user.id, decision, comment || '');
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.code === 'E_NOT_ELIGIBLE' ? 403 :
              err.code === 'E_NOT_PENDING' ? 409 : 500)
       .json({ ok: false, code: err.code, message: err.message });
  }
});

router.get('/api/po-approvals/pending', (req, res) => {
  res.json({ ok: true, items: getApprovalSystem().getPendingApprovals(req.user.id) });
});
router.get('/api/po/:id/approval-history', (req, res) => {
  res.json({ ok: true, history: getApprovalSystem().getHistory(req.params.id) });
});
router.post('/api/po-requests/:requestId/escalate', (req, res) => {
  try {
    getApprovalSystem().escalate(req.params.requestId, req.body.reason);
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ ok: false, code: err.code, message: err.message });
  }
});
module.exports = router;
```

Mount in `server.js`: `app.use(require('./po/approval-routes'));`

---

## 6. File 3 — `approval-sla-tick.js`

```javascript
'use strict';
const cron = require('node-cron');
const { getApprovalSystem } = require('./approval-system');
const log = require('../log').child({ mod: 'po-sla-tick' });

function start() {
  cron.schedule('*/5 * * * *', () => {        // every 5 min
    try {
      const expired = getApprovalSystem().tick();
      if (expired.length) log.warn({ count: expired.length, ids: expired },
        'po_sla_escalations');
    } catch (err) { log.error({ err }, 'po_sla_tick_failed'); }
  });
  log.info('po_sla_tick_started cadence=5m timeout=24h');
}
module.exports = { start };
```

The matrix `tick()` (lines 935-970) auto-escalates pending past `step_deadlines[current_step]`, expires `RETROACTIVE_PENDING` past 48h, returns expired IDs. Bootstrap: `require('./po/approval-sla-tick').start();`

---

## 7. File 4 — `approval-notifier.js` (Email + WhatsApp Fan-out)

```javascript
'use strict';
const NotificationService = require('../notifications/notification-service');

const EVENT_MAP = {
  approval_request: { type: 'po_approval_request',
    channels: ['email','whatsapp','in_app'] },
  approval_request_parallel: { type: 'po_approval_emergency',
    channels: ['email','whatsapp','sms','in_app'] },
  escalated: { type: 'po_escalated',
    channels: ['email','whatsapp','in_app'] },
  rejected: { type: 'po_rejected', channels: ['email','in_app'] },
  approved: { type: 'po_approved', channels: ['email','in_app'] },
  retroactive_expired: { type: 'po_retro_expired',
    channels: ['email','whatsapp','sms','in_app'] },
  partial_parallel: { type: 'po_partial_parallel', channels: ['in_app'] },
};

function buildApprovalNotifier() {
  const svc = new NotificationService({});
  async function emit(event) {
    const map = EVENT_MAP[event.kind];
    if (!map) return;
    const recipients = event.user_id ? [event.user_id]
      : event.remaining || event.outstanding || [];
    if (!recipients.length && event.kind === 'approved')
      recipients.push(event.submitter);
    for (const uid of recipients) {
      if (!uid) continue;
      try {
        await svc.notify(uid, map.type, {
          po_id: event.po_id, request_id: event.request_id,
          step: event.step, role: event.role, reason: event.reason,
          deep_link: `/procurement/po/${event.po_id}/approve?req=${event.request_id}`,
        }, { channels: map.channels });
      } catch (_) { /* fail-open per matrix contract */ }
    }
  }
  return { emit };
}
module.exports = { buildApprovalNotifier };
```

---

## 8. Notification Templates (he/en) — append to `notification-types.js`

```javascript
po_approval_request: {
  he: 'דרוש אישור: PO {{po_id}} בסך {{amount}} ₪. צפה: {{deep_link}}',
  en: 'Approval needed: PO {{po_id}} ₪{{amount}}. View: {{deep_link}}',
  priority: 'normal' },
po_approval_emergency: {
  he: 'חירום: PO {{po_id}} דורש אישור בתוך 48 שעות',
  en: 'EMERGENCY: PO {{po_id}} requires ratification within 48h',
  priority: 'urgent' },
po_escalated: {
  he: 'הסלמה: PO {{po_id}} עבר SLA של 24ש — נדרשת התערבות',
  en: 'ESCALATED: PO {{po_id}} past 24h SLA — intervention needed',
  priority: 'high' },
po_retro_expired: {
  he: 'תפוגת אישור רטרואקטיבי: PO {{po_id}} — חזור לסטטוס pending',
  en: 'Retroactive expired: PO {{po_id}} — reverted',
  priority: 'urgent' },
```

---

## 9. Orchestrator Action Wiring (`pipeline/orchestrator.js`)

```javascript
'po.submit_for_approval': {
  preconditions: ['po.status === draft', 'po.amount > 0'],
  effect: async (ctx) => {
    const { getApprovalSystem } = require('../po/approval-system');
    return { request_id: getApprovalSystem().submitForApproval(ctx.po) };
  },
  events: ['po.approval.submitted'],
  listeners: ['notifications', 'audit'],
},
'po.decide': {
  preconditions: ['user.is_eligible_approver'],
  effect: async (ctx) => {
    const { getApprovalSystem } = require('../po/approval-system');
    return getApprovalSystem().approve(
      ctx.request_id, ctx.user_id, ctx.decision, ctx.comment);
  },
  events: ['po.approval.decided'],
  listeners: ['notifications', 'audit', 'workflow.advance'],
},
```

---

## 10. End-to-End Flow (Acceptance)

| Step | Trigger | Expected |
|---|---|---|
| 1 | `POST /api/po/PO-2026-001/submit-for-approval` (₪35k routine) | `evaluatePO` → HIGH → [mgr,head,cfo]. Returns `request_id`. |
| 2 | Manager gets email + WhatsApp (`approval_request`) | Templates he+en. Deep link in payload. |
| 3 | Mgr `POST /decide {decision:'approve'}` | `current_step→1`, head notified. |
| 4 | 25h elapse, no decision | `tick()` → `escalate(reqId,'timeout')` → status=ESCALATED → email+WhatsApp `po_escalated`. |
| 5 | Final CFO approves | status=APPROVED, notify submitter. Audit chain complete. |
| 6 | Emergency PO (`emergency:true`, ₪200k) | `flow_type=parallel`, 4 approvers notified parallel + 48h deadline. If unrat → `tick()` flips EXPIRED + alarm. |

---

## 11. Files to Add / Modify

| Action | Path |
|---|---|
| ADD | `onyx-procurement/src/po/approval-system.js` |
| ADD | `onyx-procurement/src/po/approval-routes.js` |
| ADD | `onyx-procurement/src/po/approval-sla-tick.js` |
| ADD | `onyx-procurement/src/po/approval-notifier.js` |
| MODIFY | `onyx-procurement/src/server.js` (mount router + start tick) |
| MODIFY | `onyx-procurement/src/notifications/notification-types.js` (4 new types) |
| MODIFY | `onyx-procurement/src/pipeline/orchestrator.js` (2 new actions) |
| MODIFY | `onyx-procurement/src/pipeline/wiring-spec.js` (action→API mapping) |

---

## 12. Tests

`test/payroll/approval-matrix.test.js` already covers pure `evaluatePO()` + `createApprovalSystem()`. After wiring, add:

- `test/po/approval-routes.test.js` — supertest against the 5 endpoints.
- `test/po/approval-sla.test.js` — fast-clock injection, assert `tick()` escalates @24h, expires retro @48h.
- `test/po/approval-notify.test.js` — assert `NotificationService.notify` invoked with right channels per event kind.

---

## 13. Status

Matrix is production-ready — only wiring was missing. The 4 files above make `approval-matrix.js` reachable from HTTP, scheduler, and orchestrator. After deploy: every PO submission flows through brackets, every SLA breach auto-escalates, every event sends email+WhatsApp.

**END AGENT-275**
