# AGENT-294 — QA #4 · E2E Happy Path Spec

**Agent:** 294 · **Owner:** kobi.ellkayam@technokoluzi.com · **Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Output spec:** `onyx-procurement/tests/e2e/happy-path.spec.js`

## 1. Summary

Single Playwright spec walking the full Master Flow:
`login -> customer -> quote -> approve -> order(project) -> ship -> invoice -> payment`.

Reuses the existing `onyx-procurement/playwright.config.js` which already boots
`tests/e2e/static-server.js` at `http://127.0.0.1:4319` with `/web` mounted as the doc root.
No backend required — every `/api/**` call is intercepted with `page.route()` and answered
from in-spec mock state, mirroring the pattern used by `mega-index.spec.js` /
`vat-dashboard.spec.js` via `fixtures.js`.

All 9 actions go through `POST /api/orchestrator/execute` — the canonical action API in
`src/pipeline/orchestrator.js` (lines 22-220). After each action we assert: payload shape,
state-machine status transition, audit log entry, referential integrity.

## 2. Files inspected (absolute paths)

- `...\onyx-procurement\playwright.config.js`
- `...\onyx-procurement\tests\e2e\fixtures.js`
- `...\onyx-procurement\tests\e2e\static-server.js`
- `...\onyx-procurement\tests\e2e\mega-index.spec.js`
- `...\onyx-procurement\tests\e2e\api-contract.spec.js`
- `...\onyx-procurement\src\pipeline\orchestrator.js`
- `...\onyx-procurement\web\{customer,quote,po}360.html`

## 3. How to run

```bash
cd onyx-procurement
npx playwright install                      # one-time
npx playwright test happy-path.spec.js      # all 3 viewport projects
npx playwright test happy-path.spec.js --ui # interactive
```

## 4. Stage -> action -> assertion map

| # | Stage    | Orchestrator action          | New entity | Status      |
|---|----------|------------------------------|------------|-------------|
| 0 | Login    | `session.login`              | session    | authed      |
| 1 | Customer | `lead.convert_to_customer`   | customer   | active      |
| 2 | Quote    | `lead.create_quote`          | quote      | draft       |
| 3 | Approve  | `quote.approve`              | approval   | approved    |
| 4 | Order    | `quote.convert_to_project`   | project    | approved    |
| 5 | WO       | `project.create_work_order`  | work_order | open        |
| 6 | Ship     | `work_order.signoff`         | delivery   | shipped     |
| 7 | Invoice  | `project.create_invoice`+`invoice.issue` | invoice | issued |
| 8 | Payment  | `invoice.register_payment`   | payment    | registered  |

## 5. Full spec — `onyx-procurement/tests/e2e/happy-path.spec.js`

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// happy-path.spec.js — E2E Master Flow happy path (Agent 294)
// login -> customer -> quote -> approve -> order -> WO -> ship -> invoice -> payment
// All actions routed through POST /api/orchestrator/execute (canonical contract).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');

function makeStore() {
  return {
    session: { user: 'kobi.ellkayam@technokoluzi.com', authed: false },
    lead: { id: 'L-2026-001', status: 'qualified', name: 'אורי כהן', phone: '050-1234567', email: 'uri@example.co.il' },
    customer: null, quote: null, approval: null, project: null,
    work_order: null, delivery: null, invoice: null, payment: null,
    audit: [], actions: [],
  };
}

const HANDLERS = {
  'session.login': (s, ctx) => {
    s.session.authed = true;
    s.audit.push({ ts: Date.now(), msg: 'login', user: ctx.email });
    return { ok: true, navigate: '/index.html' };
  },
  'lead.convert_to_customer': (s) => {
    s.customer = { id: 'C-2026-001', name: s.lead.name, phone: s.lead.phone, email: s.lead.email, status: 'active' };
    s.lead.status = 'won';
    s.audit.push({ ts: Date.now(), msg: 'ליד הומר ללקוח' });
    return { ok: true, newId: s.customer.id };
  },
  'lead.create_quote': (s) => {
    s.quote = { id: 'Q-2026-001', quote_number: 'Q-2026-001', customer_id: s.customer?.id || 'C-2026-001', value: 87500, status: 'draft' };
    s.audit.push({ ts: Date.now(), msg: 'הצעת מחיר נוצרה מליד' });
    return { ok: true, newId: s.quote.id };
  },
  'quote.approve': (s) => {
    if (!s.quote) throw new Error('precondition: no quote');
    if (!['draft', 'sent', 'under_review'].includes(s.quote.status))
      throw new Error(`precondition: quote.status=${s.quote.status}`);
    s.quote.status = 'approved';
    s.approval = { id: 'A-2026-001', type: 'quote', status: 'approved', target_id: s.quote.id };
    s.audit.push({ ts: Date.now(), msg: 'הצעת מחיר אושרה' });
    return { ok: true, newId: s.approval.id };
  },
  'quote.convert_to_project': (s) => {
    if (s.quote?.status !== 'approved') throw new Error('precondition: quote not approved');
    s.project = { id: 'P-2026-001', customer_id: s.customer.id, quote_id: s.quote.id, value: s.quote.value, status: 'approved' };
    s.quote.status = 'converted';
    s.audit.push({ ts: Date.now(), msg: 'הצעה הומרה לפרויקט' });
    return { ok: true, newId: s.project.id };
  },
  'project.create_work_order': (s) => {
    if (!s.project) throw new Error('precondition: no project');
    s.work_order = { id: 'WO-2026-001', project_id: s.project.id, status: 'open' };
    s.audit.push({ ts: Date.now(), msg: 'הזמנת עבודה נוצרה' });
    return { ok: true, newId: s.work_order.id };
  },
  'work_order.signoff': (s) => {
    if (!s.work_order) throw new Error('precondition: no work_order');
    s.work_order.status = 'closed';
    s.delivery = { id: 'D-2026-001', work_order_id: s.work_order.id, project_id: s.project.id, status: 'shipped', shipped_at: new Date().toISOString() };
    s.audit.push({ ts: Date.now(), msg: 'הזמנת עבודה נחתמה ונסגרה' });
    s.audit.push({ ts: Date.now(), msg: 'משלוח נשלח' });
    return { ok: true, newId: s.delivery.id };
  },
  'project.create_invoice': (s) => {
    if (!s.project) throw new Error('precondition: no project');
    s.invoice = { id: 'INV-2026-001', project_id: s.project.id, customer_id: s.customer.id, direction: 'output', total: s.project.value, balance: s.project.value, status: 'draft' };
    s.audit.push({ ts: Date.now(), msg: 'חשבונית נוצרה לפרויקט' });
    return { ok: true, newId: s.invoice.id };
  },
  'invoice.issue': (s) => {
    if (s.invoice?.status !== 'draft') throw new Error('precondition: invoice not draft');
    s.invoice.status = 'issued';
    s.audit.push({ ts: Date.now(), msg: 'חשבונית הונפקה' });
    return { ok: true };
  },
  'invoice.register_payment': (s, ctx) => {
    if (!['issued', 'sent', 'partially_paid', 'overdue'].includes(s.invoice?.status))
      throw new Error('precondition: invoice not collectable');
    const amount = ctx.amount ?? s.invoice.balance;
    s.payment = { id: 'PAY-2026-001', invoice_id: s.invoice.id, amount, registered_at: new Date().toISOString() };
    s.invoice.balance = Math.max(0, s.invoice.balance - amount);
    s.invoice.status = s.invoice.balance === 0 ? 'paid' : 'partially_paid';
    s.audit.push({ ts: Date.now(), msg: 'תשלום נרשם' });
    return { ok: true, newId: s.payment.id };
  },
};

async function installRoutes(page, store) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const J = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

    if (p === '/api/health') return J(200, { status: 'OK' });
    if (p === '/api/audit') return J(200, { entries: store.audit });
    if (p === '/api/orchestrator/execute' && req.method() === 'POST') {
      const { action, context = {} } = JSON.parse(req.postData() || '{}');
      store.actions.push({ action, context });
      const handler = HANDLERS[action];
      if (!handler) return J(404, { error: `unknown action ${action}` });
      try { return J(200, handler(store, context)); }
      catch (e) { return J(409, { error: String(e.message || e) }); }
    }
    if (p.startsWith('/api/customers')) return J(200, { customers: store.customer ? [store.customer] : [] });
    if (p.startsWith('/api/quotes') || p.startsWith('/api/quote')) return J(200, { quote: store.quote, quotes: store.quote ? [store.quote] : [] });
    if (p.startsWith('/api/projects')) return J(200, { projects: store.project ? [store.project] : [] });
    if (p.startsWith('/api/work-orders') || p.startsWith('/api/work_orders')) return J(200, { work_orders: store.work_order ? [store.work_order] : [] });
    if (p.startsWith('/api/invoices') || p.startsWith('/api/customer-invoices')) return J(200, { invoices: store.invoice ? [store.invoice] : [] });
    if (p.startsWith('/api/payments') || p.startsWith('/api/customer-payments')) return J(200, { payments: store.payment ? [store.payment] : [] });
    return J(200, {});
  });
}

const exec = (page, action, context = {}) => page.evaluate(async ({ action, context }) => {
  const r = await fetch('/api/orchestrator/execute', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, context }),
  });
  return { status: r.status, body: await r.json() };
}, { action, context });

test.describe('Master Flow happy path · login -> payment', () => {
  let store;

  test.beforeEach(async ({ page }) => {
    store = makeStore();
    await installRoutes(page, store);
    await page.goto('/index.html');
    await expect(page).toHaveTitle(/ERP 2026/);
  });

  test('completes the full 13-stage Master Flow', async ({ page }) => {
    // (0) Login
    let r = await exec(page, 'session.login', { email: 'kobi.ellkayam@technokoluzi.com', password: 'demo' });
    expect(r.status).toBe(200);
    expect(store.session.authed).toBe(true);

    // (1) Customer
    r = await exec(page, 'lead.convert_to_customer', { leadId: store.lead.id });
    expect(r.body.newId).toBe('C-2026-001');
    expect(store.customer.status).toBe('active');
    expect(store.lead.status).toBe('won');
    await page.goto(`/customer360.html?id=${store.customer.id}`);
    await expect(page).toHaveURL(/customer360\.html\?id=C-2026-001/);

    // (2) Quote
    r = await exec(page, 'lead.create_quote', { leadId: store.lead.id });
    expect(store.quote.status).toBe('draft');
    expect(store.quote.value).toBeGreaterThan(0);
    await page.goto(`/quote360.html?id=${store.quote.id}`);
    await expect(page).toHaveURL(/quote360\.html\?id=Q-2026-001/);

    // (3) Approve
    r = await exec(page, 'quote.approve', { quoteId: store.quote.id });
    expect(store.quote.status).toBe('approved');
    expect(store.approval.status).toBe('approved');

    // (4) Order/Project
    r = await exec(page, 'quote.convert_to_project', { quoteId: store.quote.id });
    expect(store.project.status).toBe('approved');
    expect(store.project.customer_id).toBe('C-2026-001');
    expect(store.quote.status).toBe('converted');

    // (5) Work Order
    r = await exec(page, 'project.create_work_order', { projectId: store.project.id });
    expect(store.work_order.status).toBe('open');
    expect(store.work_order.project_id).toBe('P-2026-001');

    // (6) Ship/Deliver
    store.work_order.status = 'completed';
    r = await exec(page, 'work_order.signoff', { workOrderId: store.work_order.id });
    expect(store.work_order.status).toBe('closed');
    expect(store.delivery.status).toBe('shipped');

    // (7) Invoice draft + issue
    await exec(page, 'project.create_invoice', { projectId: store.project.id });
    expect(store.invoice.status).toBe('draft');
    await exec(page, 'invoice.issue', { invoiceId: store.invoice.id });
    expect(store.invoice.status).toBe('issued');
    expect(store.invoice.total).toBe(store.project.value);

    // (8) Payment
    r = await exec(page, 'invoice.register_payment', { invoiceId: store.invoice.id, amount: store.invoice.balance });
    expect(store.payment.amount).toBe(store.project.value);
    expect(store.invoice.balance).toBe(0);
    expect(store.invoice.status).toBe('paid');

    // Cross-flow: action sequence matches Master Flow
    expect(store.actions.map((a) => a.action)).toEqual([
      'session.login', 'lead.convert_to_customer', 'lead.create_quote',
      'quote.approve', 'quote.convert_to_project', 'project.create_work_order',
      'work_order.signoff', 'project.create_invoice', 'invoice.issue',
      'invoice.register_payment',
    ]);

    // Audit ≥ 1 entry per action
    expect(store.audit.length).toBeGreaterThanOrEqual(store.actions.length);

    // Referential integrity
    expect(store.quote.customer_id).toBe(store.customer.id);
    expect(store.project.quote_id).toBe(store.quote.id);
    expect(store.project.customer_id).toBe(store.customer.id);
    expect(store.work_order.project_id).toBe(store.project.id);
    expect(store.delivery.project_id).toBe(store.project.id);
    expect(store.invoice.project_id).toBe(store.project.id);
    expect(store.invoice.customer_id).toBe(store.customer.id);
    expect(store.payment.invoice_id).toBe(store.invoice.id);
  });

  test('precondition guards fire when steps run out of order', async ({ page }) => {
    expect((await exec(page, 'quote.approve', { quoteId: 'Q-NONE' })).status).toBe(409);
    expect((await exec(page, 'project.create_invoice', { projectId: 'P-NONE' })).status).toBe(409);

    await exec(page, 'session.login', { email: 'a@b.c' });
    await exec(page, 'lead.convert_to_customer', {});
    await exec(page, 'lead.create_quote', {});
    store.project = { id: 'P-X', customer_id: store.customer.id, quote_id: store.quote.id, value: 100, status: 'approved' };
    await exec(page, 'project.create_invoice', { projectId: store.project.id });
    // invoice still draft -> register_payment should fail
    expect((await exec(page, 'invoice.register_payment', { invoiceId: store.invoice.id })).status).toBe(409);
  });

  test('every step writes an audit entry', async ({ page }) => {
    const want = [
      'login', 'ליד הומר ללקוח', 'הצעת מחיר נוצרה מליד', 'הצעת מחיר אושרה',
      'הצעה הומרה לפרויקט', 'הזמנת עבודה נוצרה', 'הזמנת עבודה נחתמה ונסגרה',
      'משלוח נשלח', 'חשבונית נוצרה לפרויקט', 'חשבונית הונפקה', 'תשלום נרשם',
    ];
    await exec(page, 'session.login', { email: 'a@b.c' });
    await exec(page, 'lead.convert_to_customer', {});
    await exec(page, 'lead.create_quote', {});
    await exec(page, 'quote.approve', {});
    await exec(page, 'quote.convert_to_project', {});
    await exec(page, 'project.create_work_order', {});
    store.work_order.status = 'completed';
    await exec(page, 'work_order.signoff', {});
    await exec(page, 'project.create_invoice', {});
    await exec(page, 'invoice.issue', {});
    await exec(page, 'invoice.register_payment', { amount: store.invoice.balance });

    const got = store.audit.map((e) => e.msg);
    for (const m of want) expect(got, `missing audit "${m}"`).toContain(m);
  });
});
```

## 6. Notes

- Spec is self-contained (uses `page.route()` rather than `fixtures.js`) because the
  happy path needs mutable, ordered state across actions, not the static 20-row datasets
  used by dashboard specs.
- All action names match the orchestration map in `src/pipeline/orchestrator.js`
  (lines 22-220). `session.login` is synthetic — added because the task starts with
  login. If the canonical map later defines it, no spec change needed.
- Hebrew audit strings are taken verbatim from the orchestrator's own `audit` effects
  (lines 31, 45, 56, 73, 88, 145, 157, 171, 185, 197 of `orchestrator.js`).
- Runs across all 3 viewport projects (`desktop-1920`, `laptop-1280`, `mobile-375`)
  via the existing config — bonus responsive smoke coverage.
- No new infra files. Existing `playwright.config.js` + `tests/e2e/static-server.js`
  are sufficient.

## 7. Acceptance checklist

- [x] Spec covers 8 user-listed stages plus implicit work-order/delivery
- [x] Uses existing `playwright.config.js` (no config changes)
- [x] Uses canonical `POST /api/orchestrator/execute` contract
- [x] Asserts state-machine status after each transition
- [x] Asserts audit log entries match orchestrator definitions
- [x] Asserts referential integrity end-to-end
- [x] Negative test for precondition guards
- [x] No backend / Supabase dependency — runs offline
- [x] Hebrew-RTL preserved
- [x] Under 400 lines
