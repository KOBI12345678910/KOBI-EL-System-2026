'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/server');

let server;
let base;

before(async () => {
  const app = createApp();
  server = app.server;
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server && server.close());

async function get(path) {
  const res = await fetch(base + path);
  const body = await res.json();
  return { status: res.status, body };
}

test('GET /api/health', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.service, 'SMARTBUILD_PILOT');
  assert.equal(body.counts.apartment, 48);
});

test('core meta routes', async () => {
  const spec = await get('/api/wiring/spec');
  assert.equal(spec.status, 200);
  assert.equal(spec.body.service.port, 3400);
  assert.ok(spec.body.relationships.length >= 24);
  assert.equal(spec.body.pageContracts.length, 9);

  const em = await get('/api/entity-map/sale');
  assert.equal(em.status, 200);
  assert.equal(em.body.label, 'מכירה');

  const tr = await get('/api/state-machines/sale/transitions?current=signed');
  assert.equal(tr.status, 200);
  assert.ok(tr.body.every((t) => t.from === 'signed'));

  const stages = await get('/api/pipeline/stages');
  assert.equal(stages.body.length, 14);

  const status = await get('/api/pipeline/status/proj-1');
  assert.equal(status.body.currentStage, 'execution');

  const flows = await get('/api/workflows');
  assert.equal(flows.body.length, 6);
  const flow = await get('/api/workflows/flow_sale_to_cash');
  assert.ok(flow.body.steps.length >= 5);

  const actions = await get('/api/orchestrator/actions');
  assert.equal(actions.body.length, 21);
});

test('engine routes return sane structures', async () => {
  const budget = await get('/api/engines/budget/proj-1');
  assert.equal(budget.status, 200);
  assert.equal(budget.body.lines.length, 20);
  assert.ok(budget.body.totals.revised > 180e6 && budget.body.totals.revised < 200e6);

  const sales = await get('/api/engines/sales/proj-1');
  assert.equal(sales.body.unitsSold, 18);
  const linkage = sales.body.sales.reduce((a, s) => a + s.totalLinkagePaid, 0);
  assert.ok(linkage > 0, 'Sale-Law linkage collected must be positive');

  const cf = await get('/api/engines/cashflow/proj-1?months=36');
  assert.equal(cf.body.months.length, 36);

  const zero = await get('/api/engines/zero-report/proj-1');
  assert.ok(isFinite(zero.body.profit.gross));

  const fin = await get('/api/engines/finance/proj-1');
  assert.equal(fin.body.covenants.length, 4);
  assert.ok(fin.body.covenants.some((c) => c.status_computed === 'warning'));

  const risk = await get('/api/engines/risk/proj-1');
  assert.equal(risk.body.heatmap.length, 5);

  const mc = await get('/api/engines/montecarlo/proj-1?runs=500&seed=42');
  assert.equal(mc.body.runs, 500);
  assert.ok(isFinite(mc.body.profit.p50));
});

test('intelligence routes', async () => {
  const alerts = await get('/api/alerts/proj-1');
  assert.ok(alerts.body.length >= 5);

  const insights = await get('/api/insights/proj-1');
  assert.ok(insights.body.insights.length >= 5);
  assert.ok(insights.body.nextBestActions.length >= 1);

  const health = await get('/api/health-score/proj-1');
  assert.ok(health.body.healthScore >= 0 && health.body.healthScore <= 100);

  const summary = await get('/api/summary/proj-1');
  assert.equal(summary.status, 200);
  for (const key of ['project', 'pipeline', 'budget', 'sales', 'cashflow', 'zero', 'finance', 'alerts', 'health', 'topInsights', 'nextBestActions']) {
    assert.ok(key in summary.body, `summary missing ${key}`);
  }
  assert.ok(!JSON.stringify(summary.body).includes('NaN'));
});

test('360 route answers the six questions', async () => {
  const { status, body } = await get('/api/360/sale/sale-7');
  assert.equal(status, 200);
  assert.equal(Object.keys(body.answers).length, 6);
  assert.ok(body.def.label === 'מכירה');
  assert.ok(Array.isArray(body.transitions));
  assert.ok(body.related.payment_schedule_item.length > 0);
  assert.ok(body.extra.saleState.schedule.length === 7);
});

test('orchestrator over HTTP: success and guard failure', async () => {
  let res = await fetch(`${base}/api/orchestrator/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reserve_apartment', params: { apartment_id: 'apt-40' } }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);

  res = await fetch(`${base}/api/orchestrator/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'drawdown_loan', params: { loan_id: 'loan-1', amount: 99e9 } }),
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).ok, false);

  res = await fetch(`${base}/api/orchestrator/execute`, { method: 'POST', body: '{bad json' });
  assert.equal(res.status, 400);
});

test('entity CRUD + 404s', async () => {
  const list = await get('/api/entities/apartment?projectId=proj-1');
  assert.equal(list.body.length, 48);
  const one = await get('/api/entities/apartment/apt-1');
  assert.equal(one.body.unit_number, 'A-101');
  assert.equal((await get('/api/entities/spaceship')).status, 404);
  assert.equal((await get('/api/entities/apartment/apt-999')).status, 404);
  assert.equal((await get('/api/nope')).status, 404);
});
