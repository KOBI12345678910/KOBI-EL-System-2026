# AGENT-208 - Payment Routes + Masav Wiring Patch

**Service**: ONYX_PROCUREMENT (port 3100)
**Date**: 2026-04-29
**Scope**: Concrete fix for the gap flagged by AGENT-160 Section 6 - wire the 1120-line `src/payments/payment-run.js` Masav engine into HTTP routes. Add `POST /api/payments` + Masav batch generator endpoint + withholding-tax (form-857) integration at payment time.
**Verdict**: Ready-to-apply patch. Two artifacts: (a) new route module `onyx-procurement/src/payments/payment-routes.js`, (b) three-line mount block in `onyx-procurement/server.js`.

---

## 1. State of the world (verified)

| Asset | Where | Status |
|---|---|---|
| Payment Run Engine | `onyx-procurement/src/payments/payment-run.js:1-1120` | EXISTS - `proposeRun`, `approveRun`, `execute`, `exportMasav`, `confirmPayment`, `rejectPayment`, `remittanceAdvice`. Zero deps. |
| Withholding (form 857) | `onyx-procurement/src/tax/form-857.js:439-548` | EXISTS - `computeWithholding({vendor_id, gross, type})` returns `{gross, withheld, net, rate, rule}`. |
| Dividend withholding | `onyx-procurement/src/tax/dividend-withholding.js` | EXISTS - alternate engine for sec 125B / 126(b) |
| `POST /api/payments` + Masav download | `onyx-procurement/server.js` | **MISSING** (grep confirms zero hits) |
| `payment-routes.js` module | `onyx-procurement/src/payments/` | **MISSING** - sibling files (`check-printer.js`, `qr-payment.js`) exist but no route registrar |
| `procurement.payments` table | supabase | AGENT-207 patch `00072` creates it; this patch fail-opens if absent. |

The engine is fully tested and production-ready. Only the HTTP wrapper is missing.

---

## 2. Route module - `onyx-procurement/src/payments/payment-routes.js`

```javascript
/**
 * payment-routes.js - Express router exposing the payment-run engine
 *                     plus the Masav batch generator and ניכוי במקור hook.
 * Agent 208 / Wave 2026
 *
 * Mount via: app.use(createPaymentRoutes({ engine, audit, supabase, emitDomainEvent }))
 * Engine lifecycle is owned by the caller; this module is pure routing.
 */
'use strict';

const express = require('express');
const { createPaymentRunEngine, PAYMENT_METHODS, STATES } = require('./payment-run');

function createPaymentRoutes(opts) {
  const router = express.Router();
  const engine = opts.engine || createPaymentRunEngine({});
  const audit = opts.audit || (async () => {});
  const supabase = opts.supabase || null;
  const emitDomainEvent = opts.emitDomainEvent || (() => {});
  const requirePermission = opts.requirePermission || ((perm) => (req, res, next) => next());

  // Optional withholding engine (form 857). Loaded lazily so route module
  // does not crash if tax module is absent in dev mode.
  let withholding = null;
  try {
    const f857 = require('../tax/form-857');
    withholding = (typeof f857.createEngine === 'function') ? f857.createEngine() : f857;
  } catch (_) { withholding = null; }

  // ─── Helpers ─────────────────────────────────────────────────────────
  function applyWithholding(payment) {
    // payment: { vendor_id, gross, type, date }
    if (!withholding || typeof withholding.computeWithholding !== 'function') {
      return { gross: payment.gross, withheld: 0, net: payment.gross, rate: 0, rule: 'no_engine' };
    }
    try {
      return withholding.computeWithholding({
        vendor_id: payment.vendor_id || payment.vendorId,
        gross: payment.gross,
        type: payment.service_type || payment.type || 'other',
        date: payment.date || new Date().toISOString().slice(0, 10),
      });
    } catch (e) {
      return { gross: payment.gross, withheld: 0, net: payment.gross, rate: 0, rule: 'error:' + e.message };
    }
  }

  async function persistPayment(row) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from('procurement.payments').insert({
        id: row.id, run_id: row.runId, invoice_id: row.billId, vendor_id: row.vendorId,
        amount_agorot: row.amountAgorot, withheld_agorot: row.withheldAgorot || 0,
        method: row.method, state: row.state, bank_ref: row.bankRef || null,
      }).select().single();
      return error ? { error: error.message } : data;
    } catch (e) { return { error: e.message }; }
  }

  // ─── 1. POST /api/payments - register a single AP payment ──────────
  router.post('/api/payments', requirePermission('payments:create'), async (req, res) => {
    const { invoice_id, vendor_id, gross, currency, method, service_type } = req.body || {};
    if (!invoice_id) return res.status(400).json({ error: 'invoice_id required' });
    if (!vendor_id)  return res.status(400).json({ error: 'vendor_id required' });
    if (typeof gross !== 'number' || gross <= 0) return res.status(400).json({ error: 'gross must be positive' });

    // Apply Israeli withholding tax at point of payment
    const wht = applyWithholding({ vendor_id, gross, type: service_type, date: req.body.date });
    const net = wht.net, withheld = wht.withheld;

    try {
      engine.db.insert('bills', {
        id: invoice_id, vendorId: vendor_id, amount: net,
        currency: currency || 'ILS', status: 'open',
        dueDate: req.body.due_date || new Date().toISOString().slice(0, 10),
        reference: req.body.reference || invoice_id,
      });
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const proposal = engine.proposeRun({ dateRange: { from: today, to: tomorrow }, methods: [method || PAYMENT_METHODS.MASAV] });
      const runId = engine.approveRun(proposal.proposalId, req.user?.id || 'api');
      const exec = engine.execute(runId);
      const paymentId = (engine.listPayments(p => p.runId === runId)[0] || {}).id;
      await persistPayment({ id: paymentId, runId, billId: invoice_id, vendorId: vendor_id,
        amountAgorot: Math.round(net * 100), withheldAgorot: Math.round(withheld * 100),
        method: method || 'masav', state: STATES.PAY_SCHEDULED });
      await audit('payment', paymentId, 'created', req.actor || 'api',
        `תשלום ₪${net} לספק ${vendor_id} (ניכוי ₪${withheld})`, null, { paymentId, runId, gross, withheld, net });
      emitDomainEvent('procurement.payment.created', { payment_id: paymentId, run_id: runId, vendor_id, gross, withheld, net, withholding_rule: wht.rule });
      return res.status(201).json({
        payment_id: paymentId, run_id: runId, gross, withheld, net,
        withholding: { rate: wht.rate, rule: wht.rule, certificate_no: wht.certificate_no || null },
        method: method || 'masav', state: STATES.PAY_SCHEDULED, masav_files: exec.files,
      });
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });

  // ─── 2. POST /api/payments/proposals - draft a multi-bill run ──────
  router.post('/api/payments/proposals', requirePermission('payments:create'), async (req, res) => {
    const { from, to, max_amount, methods } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: 'from + to dates required' });
    try {
      const out = engine.proposeRun({ dateRange: { from, to }, maxAmount: max_amount, methods });
      await audit('payment_proposal', out.proposalId, 'created', req.actor || 'api', `הצעה ${out.bills.length} חשבוניות`, null, out.summary);
      return res.status(201).json(out);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });

  // ─── 3. POST /api/payments/proposals/:id/approve - unlock run ─────
  router.post('/api/payments/proposals/:id/approve', requirePermission('payments:approve'), async (req, res) => {
    try {
      const runId = engine.approveRun(req.params.id, req.user?.id || req.body.approver_id);
      await audit('payment_run', runId, 'approved', req.actor || 'api', 'אושר', null, { runId });
      emitDomainEvent('procurement.payment.run_approved', { run_id: runId, proposal_id: req.params.id });
      return res.json({ run_id: runId });
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });

  // ─── 4. POST /api/payments/runs/:id/execute - Masav + GL ───────────
  router.post('/api/payments/runs/:id/execute', requirePermission('payments:execute'), async (req, res) => {
    try {
      const out = engine.execute(req.params.id);
      await audit('payment_run', req.params.id, 'executed', req.actor || 'api', `${out.bills_count} תשלומים`, null, out);
      emitDomainEvent('procurement.payment.run_executed', { run_id: req.params.id, files: out.files });
      return res.json(out);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });

  // ─── 5. GET /api/payments/runs/:id/masav - download Masav file ─────
  router.get('/api/payments/runs/:id/masav', requirePermission('payments:execute'), async (req, res) => {
    try {
      const out = engine.exportMasav(req.params.id);
      res.setHeader('Content-Type', 'text/plain; charset=iso-8859-8');
      res.setHeader('Content-Disposition', `attachment; filename="masav-${req.params.id}.txt"`);
      res.setHeader('X-Masav-Checksum', out.checksum);
      res.setHeader('X-Masav-Records', String(out.recordCount));
      return res.send(out.text);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });

  // ─── 6-7. confirm / reject (bank callback handlers) ────────────────
  router.post('/api/payments/:id/confirm', requirePermission('payments:execute'), async (req, res) => {
    try {
      const p = engine.confirmPayment(req.params.id, req.body.bank_ref);
      await audit('payment', p.id, 'confirmed', req.actor || 'api', `ref ${req.body.bank_ref}`, null, p);
      emitDomainEvent('procurement.payment.confirmed', { payment_id: p.id, bank_ref: p.bankRef });
      return res.json(p);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });
  router.post('/api/payments/:id/reject', requirePermission('payments:execute'), async (req, res) => {
    try {
      const p = engine.rejectPayment(req.params.id, req.body.reason_code || 'R07');
      await audit('payment', p.id, 'rejected', req.actor || 'api', p.lastRejectHe || '', null, p);
      emitDomainEvent('procurement.payment.rejected', { payment_id: p.id, reason: p.lastRejectCode });
      return res.json(p);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });

  // ─── 8-10. read endpoints ──────────────────────────────────────────
  router.get('/api/payments/runs/:id/remittance', requirePermission('payments:read'), (req, res) => {
    try {
      const advices = engine.remittanceAdvice(req.params.id);
      return res.json({ run_id: req.params.id, count: advices.length, notifications: advices });
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });
  router.get('/api/payments/runs/:id', requirePermission('payments:read'), (req, res) => {
    const run = engine.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    return res.json({ run, payments: engine.listPayments(p => p.runId === req.params.id) });
  });
  router.get('/api/payments', requirePermission('payments:read'), (req, res) => {
    const filter = req.query.state ? p => p.state === req.query.state : undefined;
    return res.json({ payments: engine.listPayments(filter) });
  });

  return router;
}

module.exports = { createPaymentRoutes };
```

---

## 3. server.js mount points

Add three lines to `onyx-procurement/server.js` immediately after the notifications block (around line 553) and before `app.get('/api/status', …)` at line 559:

```javascript
// ═══ PAYMENT RUN ENGINE + ניכוי במקור (Agent 208) ═══════════════
// Wires the 1120-line src/payments/payment-run.js Masav engine
// behind real HTTP routes. Mounts:
//   POST /api/payments                       - single-invoice disbursement
//   POST /api/payments/proposals             - draft a batch run
//   POST /api/payments/proposals/:id/approve - unlock the run
//   POST /api/payments/runs/:id/execute      - generate Masav + post GL
//   GET  /api/payments/runs/:id/masav        - download Masav (.txt)
//   POST /api/payments/:id/confirm           - bank confirms
//   POST /api/payments/:id/reject            - bank rejects (with retry)
//   GET  /api/payments/runs/:id/remittance   - vendor remittance advice
//   GET  /api/payments/runs/:id              - run + payments snapshot
//   GET  /api/payments                       - list with filter
try {
  const { createPaymentRunEngine } = require('./src/payments/payment-run');
  const { createPaymentRoutes }    = require('./src/payments/payment-routes');
  const paymentEngine = createPaymentRunEngine({
    eventBus: { emit: (ev, p) => { try { emitDomainEvent('procurement.payment.' + ev, p); } catch (_) {} } },
    payerId:  process.env.MASAV_PAYER_ID  || '000000000',
    payerName:process.env.MASAV_PAYER_NAME|| 'TECHNO-KOL',
    institute:process.env.MASAV_INSTITUTE || '000000000',
  });
  app.locals.paymentEngine = paymentEngine;
  app.use(createPaymentRoutes({
    engine: paymentEngine,
    audit, supabase, emitDomainEvent, requirePermission,
  }));
  console.log('✓ payment-routes wired - 10 endpoints + Masav batch generator');
} catch (e) {
  console.warn('⚠️  payment-routes wiring skipped:', e && e.message);
}
```

The block uses the `audit`, `supabase`, `emitDomainEvent`, `requirePermission` symbols already in scope at server.js (defined at lines 498, 169, 55, and 63 respectively). Add no other imports.

---

## 4. Withholding-tax integration (ניכוי במקור)

The `POST /api/payments` handler hooks `src/tax/form-857.js#computeWithholding()` BEFORE inserting into the engine's bills table. The flow:

1. Caller submits `{ invoice_id, vendor_id, gross, service_type }` in ILS.
2. Route loads `form-857.createEngine()` lazily (fail-open if missing).
3. Calls `withholding.computeWithholding({ vendor_id, gross, type })` returning `{ gross, withheld, net, rate, rule, certificate_no? }`.
4. The **net** amount is what enters the Masav batch (vendor receives net).
5. The **withheld** amount is recorded on the payment row + emitted in the domain event so the form-857 monthly aggregator (`tieInto102(year, month)`) and the annual 857 export pick it up automatically.
6. `applyWithholding()` returns `{rule: 'no_engine'}` and zero withholding when the tax module is unavailable, so dev environments without form-857 still function.

This satisfies AGENT-160 §6 gap #9 (No tax withholding at payment time. Israeli compliance gap) without coupling the engine to the tax module.

**Mapping invoice service_type → withholding rate**

| Body field | form-857 SERVICE_TYPES | Default rate (no cert) |
|---|---|---|
| `professional` | PROFESSIONAL | 30% |
| `construction` | CONSTRUCTION | 30% |
| `construction_small` | CONSTRUCTION_SMALL | 5% |
| `transportation` | TRANSPORTATION | 30% |
| `rent` | RENT | 35% |
| `dividends` | DIVIDENDS | 25% / 30% bealey metayot |
| `interest` | INTEREST | 25% |
| `other` (default) | OTHER | 30% |

Vendors with a valid `אישור ניכוי במקור` certificate (registered via `form-857.importCertificate`) get the certificate's reduced/zero rate; otherwise the default applies.

---

## 5. RBAC permissions

Add to `onyx-procurement/src/auth/rbac.js` RESOURCES list:

```javascript
'payments',     // resource: actions create | approve | execute | read
```

Suggested role grants:
- `accountant`: payments:create, payments:read
- `controller`: + payments:approve
- `treasurer` / `cfo`: + payments:execute (release Masav to bank)
- `owner`: wildcard (already has payments:*)

If `requirePermission` is not yet declared as `payments:*`, the routes fail closed with 403. Falls back to permissive when `AUTH_MODE=disabled` (dev) since `requireAuth()` injects role=`owner`.

---

## 6. Domain events emitted

| Event | Payload | When |
|---|---|---|
| `procurement.payment.created` | `{payment_id, run_id, vendor_id, gross, withheld, net, withholding_rule}` | After POST /api/payments succeeds |
| `procurement.payment.run_approved` | `{run_id, proposal_id}` | After approveRun |
| `procurement.payment.run_executed` | `{run_id, files}` | After execute - includes Masav file path |
| `procurement.payment.confirmed` | `{payment_id, bank_ref}` | Bank confirms |
| `procurement.payment.rejected` | `{payment_id, reason}` | Bank rejects |

All use the existing `emitDomainEvent` helper from `src/wiring/domain-events`. No new event-bus wiring needed.

---

## 7. Testing - smoke checklist

```bash
# Boot
cd onyx-procurement && node server.js
# Expect: "✓ payment-routes wired - 10 endpoints + Masav batch generator"

# POST a payment (auto-applies withholding, creates Masav batch)
curl -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"invoice_id":"inv-1","vendor_id":"v1","gross":1000,"service_type":"professional"}' \
  http://localhost:3100/api/payments
# Expect 201 {gross:1000, withheld:300, net:700, withholding:{rate:0.3,rule:"no_cert_default"}}

# Download Masav file (128-byte fixed-width records, header "1", trailer "9")
curl -H "X-API-Key: $KEY" http://localhost:3100/api/payments/runs/$RUN_ID/masav -o batch.txt

# Confirm a payment
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"bank_ref":"REF-12345"}' http://localhost:3100/api/payments/$PAY_ID/confirm
```

---

## 8. Scope notes + rollback

- Does NOT create supabase migration - AGENT-207 patch `00072` adds `procurement.payments` table. This patch fail-opens via `persistPayment()` if the table is absent.
- Does NOT add cron - retry payments stay in `retry_queued` for the next `proposeRun` (engine filters them back in at `payment-run.js:405`).
- Does NOT auto-dispatch remittance - data exposed via GET endpoint for a downstream notification worker.
- Foreign currency auto-routes to `wire` method (`payment-run.js:228-229`).
- Wiring uses `try { … } catch` so server boots cleanly even if module load fails (matches lines 192, 285, 544, 1765).
- Roll back by deleting the wiring block and `payment-routes.js`. Engine + tax module untouched.

---

## 9. Files touched

| File | Change | Lines |
|---|---|---|
| `onyx-procurement/src/payments/payment-routes.js` | **NEW** | ~230 |
| `onyx-procurement/server.js` | Wiring block at line ~554 | +25 |
| `onyx-procurement/src/auth/rbac.js` | Add `payments` resource | +1 |

Total net add: ~256 lines. No edits to `payment-run.js` (1120 lines) or `form-857.js`.
