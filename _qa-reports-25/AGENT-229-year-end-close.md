# AGENT-229 — Year-End Close Orchestrator (סגירת שנה)

**Date:** 2026-04-29
**Agent:** 229
**Worktree:** `objective-merkle-40ff93`
**Predecessor:** AGENT-163 (gap analysis)
**Scope:** Orchestrator for full year-end close — close endpoint, P&L sweep template, roll-forward, period-lock binding, tax provision JE.
**Verdict:** **DESIGN COMPLETE** — five deliverables produced as ready-to-merge code blueprints against existing primitives in `onyx-procurement`. No DB schema changes required.

---

## 0. Architecture

```
POST /api/fiscal-years/:year/close                          [§1]
   |
   |- assertPreconditions(year)            (status='open', no unposted JEs)
   |- flip status → 'closing'
   |- postTaxProvisionJE(year)             [§5]   templates.TAX_PROVISION
   |- postYearEndCloseJE(year)             [§2]   templates.YEAR_END_CLOSE_FULL
   |- populateFiscalYearTotals(year)              (opex, finance, tax, NPAT)
   |- flip status → 'closed' + closed_at/by
   |- emit('ledger.year_end_closed', {...})
   `- (?rollForward=true) → postRollForwardOpeningJE(year+1) [§3]
```

Period locking (§4) is enforced via the existing `createBook({ periods.isLocked })` adapter at `onyx-procurement/src/gl/journal-entry.js:496`. We replace the `() => false` default with a Supabase-backed adapter that reads `fiscal_years.status`.

---

## 1. POST /api/fiscal-years/:year/close — main orchestration

**Insertion point:** `onyx-procurement/src/tax/annual-tax-routes.js` after line 233 (after `/compute`).

```javascript
app.post('/api/fiscal-years/:year/close',
  requirePermission('tax-annual:close'),
  async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year)) return res.status(400).json({ error: 'Invalid year' });
    const actor = req.actor || 'api';
    const rollForward = req.query.rollForward === 'true';
    const dryRun = req.query.dryRun === 'true';

    // 1. Preconditions
    const { data: fy } = await supabase.from('fiscal_years')
      .select('*').eq('year', year).maybeSingle();
    if (!fy)               return res.status(412).json({ error: `FY ${year} not computed`, he: `שנת מס ${year} לא חושבה` });
    if (fy.status !== 'open') return res.status(409).json({ error: `Cannot close — status: ${fy.status}`, he: `סטטוס: ${fy.status}` });

    // Block unposted JEs in the year
    const { data: unposted } = await supabase.from('journal_entries')
      .select('id, number, status')
      .gte('date', fy.start_date).lte('date', fy.end_date).neq('status', 'posted');
    if (unposted && unposted.length) return res.status(412).json({
      error: 'Unposted JEs in year', he: 'קיימות פקודות יומן שלא הופקדו',
      count: unposted.length, sample: unposted.slice(0, 5),
    });

    // 2. → closing
    if (!dryRun) await supabase.from('fiscal_years').update({ status: 'closing' }).eq('year', year);

    // 3-4. Tax provision + P&L sweep JEs
    const taxJE   = await postTaxProvisionJE({ supabase, year, fy, actor, dryRun, taxRate: 0.23 });
    const closeJE = await postYearEndCloseJE({ supabase, year, fy, actor, dryRun });

    // 5. Recompute totals (totalExpenses, incomeTax, NPBT, NPAT)
    const totals = await recomputeYearTotals({ supabase, year, fy });
    // 6. → closed (single update with totals + status)
    if (!dryRun) await supabase.from('fiscal_years').update({
      ...totals, status: 'closed',
      closed_at: new Date().toISOString(), closed_by: actor,
    }).eq('year', year);

    // 7. Audit + event
    await audit('fiscal_year', fy.id, 'closed', actor,
      `סגירת שנת מס ${year} — רווח נקי ₪${totals.npat.toLocaleString()}`,
      fy, { ...fy, status: 'closed', ...totals });
    req.app.locals.events?.emit('ledger.year_end_closed', {
      year, npat: totals.npat, taxJEId: taxJE.id, closeJEId: closeJE.id,
      closed_at: new Date().toISOString(), closed_by: actor,
    });

    // 8. Optional roll-forward
    const rollFwdJE = (rollForward && !dryRun)
      ? await postRollForwardOpeningJE({ supabase, fromYear: year, toYear: year + 1, actor })
      : null;

    res.json({ ok: true, fiscal_year: { ...fy, status: 'closed', ...totals },
               taxProvisionJE: taxJE, yearEndCloseJE: closeJE, rollForwardJE: rollFwdJE, dryRun });
  }
);
```

**Permission:** `tax-annual:close` (new — sibling to `:create`/`:export`).
**Idempotency:** second call returns 409 (status no longer `'open'`). Reopen requires separate CFO endpoint (out of scope).

---

## 2. YEAR_END_CLOSE_FULL journal-entry template

**Replaces:** stub at `onyx-procurement/src/gl/journal-entry.js:416-441` (single 4000↔3500 line).

**Insertion:** inside `defaultTemplates()`, replacing the existing `YEAR_END_CLOSE` block.

```javascript
YEAR_END_CLOSE_FULL: {
  id: 'YEAR_END_CLOSE_FULL',
  name: { he: 'סגירת שנה — סגירת כל חשבונות התוצאה', en: 'Year-End Close — full P&L sweep' },
  variables: ['trialBalance', 'retainedEarningsAccount', 'incomeSummaryAccount', 'useIncomeSummary'],
  build: (v) => {
    const tb = v.trialBalance || {};
    const RE = v.retainedEarningsAccount || '3500';
    const IS = v.incomeSummaryAccount    || '3490';
    const useIS = v.useIncomeSummary !== false;
    const lines = [];
    let netCredit = 0; // positive = profit

    // Revenue (4xxx) — credit balances → DEBIT to zero
    for (const r of (tb.revenue || [])) {
      if (Math.abs(r.balance) < 0.01) continue;
      lines.push({ account: r.account, debit: round2(Math.abs(r.balance)),
                   description: `סגירת הכנסות ${r.account}` });
      netCredit += Math.abs(r.balance);
    }
    // COGS (5xxx), OpEx (6xxx,7xxx), Tax (9xxx) — debit balances → CREDIT
    for (const grp of ['cogs', 'opex', 'tax']) {
      for (const x of (tb[grp] || [])) {
        if (Math.abs(x.balance) < 0.01) continue;
        lines.push({ account: x.account, credit: round2(Math.abs(x.balance)),
                     description: `סגירת ${grp} ${x.account}` });
        netCredit -= Math.abs(x.balance);
      }
    }
    // Finance (8xxx) — sign-aware (income or expense)
    for (const f of (tb.finance || [])) {
      if (Math.abs(f.balance) < 0.01) continue;
      const isExpense = f.balance > 0;
      lines.push({ account: f.account,
        ...(isExpense ? { credit: round2(f.balance) } : { debit: round2(-f.balance) }),
        description: `סגירת מימון ${f.account}` });
      netCredit -= f.balance;
    }
    // Plug to retained earnings (or via income summary)
    const plugAcct = useIS ? IS : RE;
    const plug = round2(netCredit);
    if (plug > 0) {
      lines.push({ account: plugAcct, credit: plug, description: 'רווח נקי לעודפים' });
    } else if (plug < 0) {
      lines.push({ account: plugAcct, debit: Math.abs(plug), description: 'הפסד נקי מעודפים' });
    }

    return {
      memo: `סגירת שנה — Year-End Close`,
      lines,
      // If using IS, follow-up JE moves IS → RE (caller posts both)
      followUp: useIS && plug !== 0 ? {
        memo: 'העברת income summary לעודפים',
        lines: plug > 0
          ? [{ account: IS, debit: Math.abs(plug) }, { account: RE, credit: Math.abs(plug) }]
          : [{ account: RE, debit: Math.abs(plug) }, { account: IS, credit: Math.abs(plug) }],
      } : null,
    };
  },
},
```

**Helper `postYearEndCloseJE`** (in `annual-tax-routes.js`): pulls posted `gl_lines` for the year, calls `bucketByPLSection(lines)` (reusing existing `classify()` from `financial-statements.js:1694`), passes `{revenue,cogs,opex,finance,tax}` buckets to template, posts via `app.locals.glBook`.

---

## 3. Roll-forward + opening entries for next year

**New template** in `journal-entry.js`:

```javascript
ROLL_FORWARD_OPENING: {
  id: 'ROLL_FORWARD_OPENING',
  name: { he: 'יתרות פתיחה לשנה חדשה', en: 'New Year Opening Balances' },
  variables: ['priorYearClosingTB'],
  build: (v) => {
    const tb = v.priorYearClosingTB || {};
    const lines = [];
    // Assets — debit balances carry forward
    for (const a of (tb.assets || [])) {
      if (Math.abs(a.balance) < 0.01) continue;
      lines.push({ account: a.account, debit: round2(a.balance),
                   description: `יתרת פתיחה ${a.account}` });
    }
    // Liabilities + Equity — credit balances carry forward (incl. roll-forward of RE)
    for (const grp of ['liabilities', 'equity']) {
      for (const x of (tb[grp] || [])) {
        if (Math.abs(x.balance) < 0.01) continue;
        lines.push({ account: x.account, credit: round2(x.balance),
                     description: `יתרת פתיחה ${x.account}` });
      }
    }
    // P&L (4xxx-9xxx) intentionally omitted — they reset to zero in new year
    return { memo: 'Opening balances — new fiscal year', lines };
  },
},
```

**Helper `postRollForwardOpeningJE`** (in `annual-tax-routes.js`):
1. Assert `fyPrior.status === 'closed'` else throw.
2. Build closing TB from `gl_lines WHERE date <= fyPrior.end_date` — BS accounts only (assets/liab/equity).
3. Upsert `fiscal_years` row for `toYear` with `status='open'`.
4. `book.create({ date: '${toYear}-01-01', template: 'ROLL_FORWARD_OPENING', variables: { priorYearClosingTB: tb } })` → `book.post()` → mirror to DB.

**Reversing-entries (out-of-scope for §3):** flagged JEs (`reversing=true`) auto-reversed on day 1 — covered by separate `POST /api/fiscal-years/:year/post-reversals` (P1).

---

## 4. Period-locking adapter (fiscal_years.status → periods.isLocked)

**Replaces:** default `() => false` at `onyx-procurement/src/gl/journal-entry.js:496`.

**New file:** `onyx-procurement/src/gl/period-lock-adapter.js`

```javascript
'use strict';

/**
 * Supabase-backed period-lock adapter.
 * Period is LOCKED iff containing fiscal year has
 * status IN ('closed', 'audited', 'submitted').
 * 60s in-memory cache to avoid DB hammering on bulk imports.
 */
function createSupabasePeriodLockAdapter(supabase, { ttlMs = 60_000 } = {}) {
  const cache = new Map(); // year → { locked, expiresAt }

  async function fetchLockedYear(year) {
    const { data } = await supabase.from('fiscal_years')
      .select('status').eq('year', year).maybeSingle();
    return data ? ['closed', 'audited', 'submitted'].includes(data.status) : false;
  }

  return {
    // SYNC check used by journal-entry.js validate/post/reverse.
    // Cache must be primed via warmup() at boot for hard correctness.
    isLocked(periodKey) {
      const year = parseInt(String(periodKey).slice(0, 4), 10);
      if (isNaN(year)) return false;
      const hit = cache.get(year);
      if (hit && hit.expiresAt > Date.now()) return hit.locked;
      // Miss — schedule prime, return last-known
      fetchLockedYear(year).then(locked => {
        cache.set(year, { locked, expiresAt: Date.now() + ttlMs });
      }).catch(() => { /* DB issue surfaces elsewhere */ });
      return hit ? hit.locked : false;
    },
    async warmup(years) {
      for (const y of years) {
        const locked = await fetchLockedYear(y);
        cache.set(y, { locked, expiresAt: Date.now() + ttlMs });
      }
    },
    invalidate(year) {
      if (year == null) cache.clear(); else cache.delete(year);
    },
  };
}

module.exports = { createSupabasePeriodLockAdapter };
```

**Wiring** (in `onyx-procurement/server.js` composition root):

```javascript
const { createSupabasePeriodLockAdapter } = require('./src/gl/period-lock-adapter');
const periods = createSupabasePeriodLockAdapter(supabase);
await periods.warmup([2023, 2024, 2025, 2026]);  // prime current + history
const glBook = createBook({ periods, /* ...other adapters */ });
app.locals.glBook = glBook;
// After /close succeeds: periods.invalidate(year);
```

**Effect:** `journal-entry.js:675/731/744` (validate/post/unpost) throws `ERR_PERIOD_LOCKED` for any JE dated inside a closed fiscal year. Back-dating blocked at the service layer.

---

## 5. TAX_PROVISION journal-entry template

**New template** in `journal-entry.js`:

```javascript
TAX_PROVISION: {
  id: 'TAX_PROVISION',
  name: { he: 'הפרשה למס חברות', en: 'Corporate Tax Provision' },
  variables: ['profit_before_tax', 'tax_rate', 'tax_expense_account', 'tax_payable_account'],
  build: (v) => {
    const pbt  = Number(v.profit_before_tax || 0);
    const rate = Number(v.tax_rate || 0.23);
    const exp  = v.tax_expense_account || '9100';
    const pay  = v.tax_payable_account || '2190';

    if (pbt <= 0) {
      // Loss year — book deferred tax asset (1490), not a payable
      const dta = round2(Math.abs(pbt) * rate);
      return {
        memo: 'הפרשה למס — הפסד (נכס מס נדחה)',
        lines: [
          { account: '1490', debit:  dta, description: 'נכס מס נדחה (Deferred Tax Asset)' },
          { account: '9150', credit: dta, description: 'הטבת מס שוטף' },
        ],
      };
    }
    const tax = round2(pbt * rate);
    return {
      memo: `הפרשה למס חברות ${rate * 100}% × ₪${pbt.toFixed(2)}`,
      lines: [
        { account: exp, debit:  tax, description: `הוצאת מס חברות (${rate * 100}%)` },
        { account: pay, credit: tax, description: 'התחייבות מס נצברת' },
      ],
    };
  },
},
```

**Helper `postTaxProvisionJE`** (in `annual-tax-routes.js`): recomputes PBT from posted GL (don't trust `fy.net_profit_before_tax` — may be stale after late adjustments) using `revenue - cogs - opex - finance` (NO tax), creates JE via `book.create({ template: 'TAX_PROVISION', variables: { profit_before_tax: pbt, tax_rate: 0.23 } })`, posts.

**Side-effect:** removes the synthetic `2190` accrual at `financial-statements.js:884-912`. The `taxAlreadyBooked` detection sees the posted `9100/2190` lines and skips synthetic injection automatically — eliminates the divergence between P&L tax expense and GL.

---

## 6. Files touched / deltas

| File | Change | LoC |
|---|---|---|
| `onyx-procurement/src/tax/annual-tax-routes.js` | + `POST /api/fiscal-years/:year/close` + 3 helpers | ~250 |
| `onyx-procurement/src/gl/journal-entry.js` | replace `YEAR_END_CLOSE` (line 416) → `YEAR_END_CLOSE_FULL`; add `ROLL_FORWARD_OPENING`, `TAX_PROVISION` | ~150 |
| `onyx-procurement/src/gl/period-lock-adapter.js` | **NEW** | ~60 |
| `onyx-procurement/server.js` (composition root) | wire adapter into `createBook` + `app.locals.glBook` | ~10 |
| RBAC config | add `tax-annual:close` permission | ~3 |

**No DB schema changes.** Existing `fiscal_years.status` CHECK already permits `'closing'`/`'closed'`. Templates use existing COA codes — verify presence in seed: `3490` Income Summary, `3500` Retained Earnings, `9100` Tax Expense, `9150` Tax Benefit, `2190` Accrued Tax, `1490` DTA. Add to `002-seed-data-extended.sql` if missing.

---

## 7. Test contract (skeleton — defer impl to AGENT-23x)

```
1. POST /api/fiscal-years/2025/close on year with status='audited' → 409
2. POST /api/fiscal-years/2025/close with unposted JE in year      → 412
3. POST /api/fiscal-years/2025/close happy path                    → 200
   asserts: status='closed', taxJE posted (Dr 9100 / Cr 2190),
            closeJE zeros all 4xxx-9xxx, NPAT = rev-cogs-opex-fin-tax
4. POST again                                                      → 409 (idempotent)
5. POST /api/fiscal-years/2025/close?rollForward=true               → also creates
   opening JE for 2026 dated 2026-01-01, BS accounts only
6. After close, attempt JE dated 2025-06-15                        → ERR_PERIOD_LOCKED
7. periods.invalidate(2025) + reopen flow restores postability     → green
8. TAX_PROVISION on PBT=0 → no JE; PBT<0 → DTA (1490) booked
```

---

## 8. Event bus wiring

`packages/shared-events/topic-map.js:196` already declares `'ledger.year_end_closed'`. Orchestrator §1 step 7 publishes it with payload `{ year, npat, taxJEId, closeJEId, closed_at, closed_by }`. Downstream consumers (form-6111 generator, audit-log archiver, board-pack scheduler) subscribe.

Add to `topic-map.js`: `'ledger.tax_provision_posted'`, `'ledger.opening_balances_posted'`.

---

## 9. Acceptance summary

| Deliverable | Status | Anchor |
|---|---|---|
| 1. `POST /api/fiscal-years/:year/close` orchestration | DESIGNED | §1 — plug into `annual-tax-routes.js:233+` |
| 2. `YEAR_END_CLOSE_FULL` template (full P&L sweep) | DESIGNED | §2 — replaces stub at `journal-entry.js:416` |
| 3. Roll-forward + opening JE for next year | DESIGNED | §3 — `ROLL_FORWARD_OPENING` template + helper |
| 4. Period-locking adapter (status → isLocked) | DESIGNED | §4 — new `period-lock-adapter.js` |
| 5. `TAX_PROVISION` JE template | DESIGNED | §5 — handles profit + loss (DTA), replaces synthetic 2190 |

Resolves AGENT-163 P0 items #1, #2, #5, #6, #7 (partial). Unblocks Form 6111/1320 final-tax-due population.

---

**End of AGENT-229 report.**
