/**
 * SmartBuild Pilot 2.0 — HTTP Server (node:http, zero dependencies)
 *
 * REST API + static control-tower UI. All routes derive from the core
 * modules and engines — the server itself contains no business logic.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { ENTITY_TYPES, TODAY } = require('./core/contracts');
const { createStore } = require('./data/store');
const { seed } = require('./data/seed');
const { createEventBus } = require('./engines/event-bus');
const { createOrchestrator } = require('./core/orchestrator');
const { ENTITY_MAP, getEntityDef } = require('./core/entity-map');
const { STATE_MACHINES, availableTransitions } = require('./core/state-machines');
const { FLOWS, getFlow } = require('./core/workflow-flows');
const { STAGES, computePipelineStatus } = require('./core/pipeline-engine');
const { WIRING_SPEC } = require('./core/wiring-spec');
const { computeBudget } = require('./engines/budget-engine');
const { computeSales, computeSaleState } = require('./engines/sales-engine');
const { computeCashflow } = require('./engines/cashflow-engine');
const { computeZeroReport } = require('./engines/zero-report-engine');
const { computeFinance } = require('./engines/finance-engine');
const { computeRisks } = require('./engines/risk-engine');
const { runMonteCarlo } = require('./engines/montecarlo-engine');
const { refreshAlerts } = require('./engines/alert-engine');
const { computeInsights, entityNextStep } = require('./engines/insights-engine');
const { computeHealth } = require('./engines/health-engine');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// תשובות "No Dead Pages" — 6 השאלות, מנוסחות חי מהנתונים
function noDeadPagesAnswers(store, type, entity, def, transitions, nextStep) {
  const project = entity.project_id ? store.get('project', entity.project_id) : null;
  const statusField = type === 'change_order' ? entity.approval_status : entity.status;
  return {
    'איפה אני?': project ? `${def.label} בפרויקט "${project.name}" (${project.city})` : `${def.label} במערכת SmartBuild Pilot`,
    'מה זה?': def.purpose,
    'מה הסטטוס?': statusField || 'ללא סטטוס',
    'מה אפשר לעשות?': transitions.length ? transitions.map((t) => t.label).join(', ') : (def.actions || []).map((a) => a.label).join(', ') || 'צפייה בלבד',
    'מה הצעד הבא?': nextStep ? `${nextStep.label} — ${nextStep.reason}` : 'אין פעולה נדרשת',
    'רשומות קשורות': (def.links || []).join(', ') || 'אין',
  };
}

function related360(store, type, entity) {
  const def = getEntityDef(type);
  const related = {};
  for (const linkType of def.links || []) {
    if (!ENTITY_TYPES.includes(linkType)) continue;
    // ישות אב: <linkType>_id עלינו; ישויות בנות: <type>_id אצלן
    const parentFk = `${linkType}_id`;
    if (entity[parentFk]) {
      const parent = store.get(linkType, entity[parentFk]);
      related[linkType] = parent ? [parent] : [];
      continue;
    }
    const childFk = `${type}_id`;
    related[linkType] = store.find(linkType, (r) => r[childFk] === entity.id).slice(0, 25);
  }
  return related;
}

function createApp() {
  const store = createStore();
  store.reset(seed);
  const bus = createEventBus(store);
  const orch = createOrchestrator(store, bus);

  function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    const method = req.method;

    if (method === 'OPTIONS') return json(res, 204, {});

    // ── סטטי ──
    if (!parts.length || parts[0] !== 'api') {
      const rel = parts.length ? parts.join('/') : 'index.html';
      const file = path.normalize(path.join(PUBLIC_DIR, rel));
      if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return json(res, 404, { error: 'not found' });
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }

    const [, seg1, seg2, seg3] = parts;
    const respond = (body) => (body === null || body === undefined
      ? json(res, 404, { error: 'not found' }) : json(res, 200, body));

    try {
      // ── מערכת ──
      if (method === 'GET' && seg1 === 'health' && !seg2) {
        return respond({ ok: true, service: 'SMARTBUILD_PILOT', version: '2.0', asOf: TODAY, counts: store.counts() });
      }
      if (method === 'GET' && seg1 === 'wiring' && seg2 === 'spec') return respond(WIRING_SPEC);
      if (method === 'GET' && seg1 === 'events') return respond(bus.ledger());

      // ── entity-map ──
      if (method === 'GET' && seg1 === 'entity-map') {
        return respond(seg2 ? getEntityDef(seg2) : ENTITY_MAP);
      }

      // ── state machines ──
      if (method === 'GET' && seg1 === 'state-machines' && seg2 && seg3 === 'transitions') {
        const machine = STATE_MACHINES[seg2];
        if (!machine) return json(res, 404, { error: `no state machine for ${seg2}` });
        const current = url.searchParams.get('current');
        return respond(current ? availableTransitions(seg2, current) : machine.transitions);
      }

      // ── pipeline ──
      if (method === 'GET' && seg1 === 'pipeline' && seg2 === 'stages') return respond(STAGES);
      if (method === 'GET' && seg1 === 'pipeline' && seg2 === 'status' && seg3) {
        return respond(computePipelineStatus(store, seg3));
      }

      // ── workflows ──
      if (method === 'GET' && seg1 === 'workflows') {
        return respond(seg2 ? getFlow(seg2) : Object.values(FLOWS).map(({ id, label, description }) => ({ id, label, description })));
      }

      // ── orchestrator ──
      if (method === 'GET' && seg1 === 'orchestrator' && seg2 === 'actions') return respond(orch.listActions());
      if (method === 'POST' && seg1 === 'orchestrator' && seg2 === 'execute') {
        return readBody(req)
          .then((body) => {
            if (!body.action) return json(res, 400, { ok: false, error: 'missing action' });
            const outcome = orch.execute(body.action, body.params || {});
            return json(res, outcome.ok ? 200 : 422, outcome);
          })
          .catch(() => json(res, 400, { ok: false, error: 'invalid JSON body' }));
      }

      // ── ישויות ──
      if (seg1 === 'entities' && seg2) {
        if (!ENTITY_TYPES.includes(seg2)) return json(res, 404, { error: `unknown entity type: ${seg2}` });
        if (method === 'GET' && !seg3) {
          const projectId = url.searchParams.get('projectId');
          let list = store.list(seg2);
          if (projectId) list = list.filter((r) => r.project_id === projectId || !('project_id' in r));
          return respond(list);
        }
        if (method === 'GET' && seg3) return respond(store.get(seg2, seg3));
        if (method === 'POST' && !seg3) {
          return readBody(req)
            .then((body) => json(res, 201, store.create(seg2, body)))
            .catch(() => json(res, 400, { error: 'invalid JSON body' }));
        }
        if (method === 'PATCH' && seg3) {
          return readBody(req)
            .then((body) => respond(store.update(seg2, seg3, body)))
            .catch(() => json(res, 400, { error: 'invalid JSON body' }));
        }
      }

      // ── 360 ──
      if (method === 'GET' && seg1 === '360' && seg2 && seg3) {
        const def = getEntityDef(seg2);
        const entity = ENTITY_TYPES.includes(seg2) ? store.get(seg2, seg3) : null;
        if (!def || !entity) return json(res, 404, { error: 'entity not found' });
        const statusValue = seg2 === 'change_order' ? entity.approval_status : entity.status;
        const transitions = statusValue ? availableTransitions(seg2, statusValue) : [];
        const nextStep = entityNextStep(store, seg2, seg3);
        const audit = store.find('audit_event', (a) => a.entity_type === seg2 && a.entity_id === seg3).slice(-10).reverse();
        const extra = {};
        if (seg2 === 'sale') extra.saleState = computeSaleState(store, entity);
        if (seg2 === 'budget_item') {
          const { computeBudgetLine } = require('./engines/budget-engine');
          extra.computed = computeBudgetLine(entity);
        }
        return respond({
          entity, def, transitions, nextStep,
          related: related360(store, seg2, entity),
          audit,
          answers: noDeadPagesAnswers(store, seg2, entity, def, transitions, nextStep),
          extra,
        });
      }

      // ── מנועים ──
      if (method === 'GET' && seg1 === 'engines' && seg2 && seg3) {
        const projectId = seg3;
        switch (seg2) {
          case 'budget': return respond(computeBudget(store, projectId));
          case 'sales': return respond(computeSales(store, projectId));
          case 'cashflow': {
            const months = parseInt(url.searchParams.get('months') || '', 10) || undefined;
            return respond(computeCashflow(store, projectId, { months }));
          }
          case 'zero-report': return respond(computeZeroReport(store, projectId));
          case 'finance': return respond(computeFinance(store, projectId));
          case 'risk': return respond(computeRisks(store, projectId));
          case 'montecarlo': {
            const runs = parseInt(url.searchParams.get('runs') || '', 10) || undefined;
            const mcSeed = parseInt(url.searchParams.get('seed') || '', 10) || undefined;
            return respond(runMonteCarlo(store, projectId, { runs, seed: mcSeed }));
          }
          default: return json(res, 404, { error: `unknown engine: ${seg2}` });
        }
      }

      // ── אינטליגנציה ──
      if (method === 'GET' && seg1 === 'alerts' && seg2) return respond(refreshAlerts(store, seg2));
      if (method === 'GET' && seg1 === 'insights' && seg2) return respond(computeInsights(store, seg2));
      if (method === 'GET' && seg1 === 'health-score' && seg2) return respond(computeHealth(store, seg2));
      if (method === 'GET' && seg1 === 'summary' && seg2) {
        const projectId = seg2;
        const project = store.get('project', projectId);
        if (!project) return json(res, 404, { error: 'project not found' });
        const budget = computeBudget(store, projectId);
        const sales = computeSales(store, projectId);
        const cashflow = computeCashflow(store, projectId);
        const zero = computeZeroReport(store, projectId);
        const finance = computeFinance(store, projectId);
        const alerts = refreshAlerts(store, projectId);
        const health = computeHealth(store, projectId);
        const { insights, nextBestActions } = computeInsights(store, projectId);
        return respond({
          project,
          pipeline: computePipelineStatus(store, projectId),
          budget: { totals: budget.totals, contingency: budget.contingency },
          sales: {
            unitsTotal: sales.unitsTotal, unitsSold: sales.unitsSold, soldPct: sales.soldPct,
            signedRevenue: sales.signedRevenue, collected: sales.collected,
            outstanding: sales.outstanding, overdueAmount: sales.overdueAmount,
            salesPacePerMonth: sales.salesPacePerMonth, monthsToSellOut: sales.monthsToSellOut,
          },
          cashflow: { peakDeficit: cashflow.peakDeficit, endBalance: cashflow.endBalance, equityRequired: cashflow.equityRequired, fundingGap: cashflow.fundingGap },
          zero: { profit: zero.profit, irr_annual: zero.irr_annual, npv: zero.npv, breakeven: zero.breakeven },
          finance: {
            ltv: finance.ltv, ltc: finance.ltc, presalesCoveragePct: finance.presalesCoveragePct,
            covenants: finance.covenants.map((c) => ({ id: c.id, name: c.name, actual: c.actual, threshold: c.threshold, operator: c.operator, status: c.status_computed })),
          },
          alerts: {
            active: alerts.length,
            critical: alerts.filter((a) => a.severity === 'critical').length,
            items: alerts.slice(0, 10),
          },
          health,
          topInsights: insights.slice(0, 3),
          nextBestActions,
        });
      }

      return json(res, 404, { error: `unknown route: ${method} ${url.pathname}` });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  const server = http.createServer(handle);
  return { server, store, bus, orch };
}

function createServer() {
  return createApp();
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3400', 10);
  const { server } = createApp();
  server.listen(port, () => {
    console.log(`🏗️  SmartBuild Pilot 2.0 — http://localhost:${port}  (API: /api/summary/proj-1)`);
  });
}

module.exports = { createServer, createApp };
