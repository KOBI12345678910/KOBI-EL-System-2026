/**
 * Tests — QBR Generator
 * Agent Y-104 • Techno-Kol Uzi mega-ERP • Swarm Customer Success
 *
 * Zero-dependency — uses only node:test + node:assert.
 * Covers:
 *   • Data-pull aggregation from every stub module
 *   • Section assembly (all 11 sections)
 *   • PDF + Slides structure
 *   • Prep 1-pager
 *   • Commitment tracking (append-only)
 *   • Follow-up actions (append-only)
 *   • scheduleNextQBR (quarter rollover + end-of-year)
 *   • Exec sponsor placeholder
 *   • Never-delete rule (supersede + store shape)
 *   • Bilingual labels
 *
 * Run: node --test test/customer/qbr-generator.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  QBRGenerator,
  SECTIONS,
  SECTION_ORDER,
  HEALTH_BAND,
  QBR_STATUS,
  COMMITMENT_STATUS,
  GOAL_STATUS,
  ACTION_OWNER,
  LABELS,
  PALANTIR_THEME,
  createMemoryStore,
  createStubModules,
  normalizeQuarter,
  computeHealthScore,
  bandOf,
} = require('../../src/customer/qbr-generator.js');

// ──────────────────────────────────────────────────────────────────
// FIXTURES
// ──────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-11T08:00:00.000Z');
const CUSTOMER = 'CUST-001';
const Q = '2026-Q1';

function makeModules() {
  return {
    customers: {
      getCustomer: (id) => ({ id, name: 'Techno-Kol Customer A', segment: 'enterprise' }),
      getExecSponsor: (id) => ({
        name: 'Moshe Levy',
        title: 'CFO',
        email: 'moshe@customer-a.co.il',
        phone: '050-1234567',
      }),
    },
    billing: {
      getQuarter: () => ({
        currency: 'ILS',
        mrr: 12000,
        arr: 144000,
        contractValue: 144000,
        invoicesCount: 3,
        amountInvoiced: 36000,
        amountCollected: 36000,
        renewalDate: '2027-01-01',
      }),
      getExpansionOpportunities: () => ([
        { id: 'EXP-1', title: { he: 'מודול מלאי', en: 'Inventory module' },
          module: 'inventory', arrUplift: 24000, probability: 0.6, nextStep: 'demo' },
        { id: 'EXP-2', title: { he: 'מושבים נוספים', en: 'Additional seats' },
          module: 'seats', arrUplift: 12000, probability: 0.8, nextStep: 'quote' },
      ]),
    },
    usage: {
      getQuarter: () => ({
        logins: 1840,
        activeUsers: 42,
        activeUsersTrendPct: 15,
        eventsTotal: 12500,
        featuresUsed: ['invoices', 'po', 'inventory', 'reports', 'dashboard', 'expenses'],
        valueDelivered: { amount: 280000, currency: 'ILS', unit: 'savings' },
        dauWau: 0.6,
      }),
    },
    support: {
      getQuarter: () => ({
        opened: 18,
        closed: 16,
        p1Count: 1,
        avgResolutionHours: 7.5,
        firstResponseHours: 1.2,
        csat: 4.6,
        nps: 52,
        escalations: 1,
        topCategories: [
          { key: 'integration', count: 6 },
          { key: 'how-to',      count: 5 },
          { key: 'bug',         count: 4 },
        ],
      }),
    },
    health: {
      getSnapshot: () => ({
        score: 82,
        metrics: { usage: 80, sentiment: 90, support: 85, financial: 100, adoption: 70, sponsorship: 75 },
        trend: 'up',
        notes: 'strong Q1',
      }),
    },
    success: {
      getPlan: () => ({
        kpis: [
          { id: 'K1', label: { he: 'חיסכון רבעוני', en: 'Quarterly savings' },
            target: 250000, actual: 280000, unit: 'ILS' },
          { id: 'K2', label: { he: 'זמן טיפול', en: 'Cycle time' },
            target: 48, actual: 36, unit: 'hours' },
        ],
        goals: [
          { id: 'G1', title: { he: 'הטמעת מודול מלאי', en: 'Deploy inventory' },
            status: GOAL_STATUS.ACHIEVED, progressPct: 100 },
          { id: 'G2', title: { he: 'הדרכת משתמשים', en: 'User training' },
            status: GOAL_STATUS.IN_PROGRESS, progressPct: 60 },
          { id: 'G3', title: { he: 'אינטגרציית בנק', en: 'Bank integration' },
            status: GOAL_STATUS.AT_RISK, progressPct: 30 },
        ],
        asks: [
          { id: 'A1', title: { he: 'תמיכת SSO', en: 'SSO support' }, from: 'customer', priority: 'high' },
        ],
        previousCommitments: [
          { id: 'PC1', title: { he: 'דוח מכס', en: 'Customs report' },
            status: COMMITMENT_STATUS.DONE, dueDate: '2026-03-15' },
        ],
        nextQuarterGoals: [
          { id: 'NG1', title: { he: 'אוטומציה מלאה', en: 'Full automation' },
            owner: 'CSM', targetDate: '2026-06-30', metric: '95% automated' },
        ],
      }),
    },
    roadmap: {
      getItemsFor: () => ([
        { id: 'RM1', title: { he: 'גרסת מובייל', en: 'Mobile app' },
          stage: 'beta', eta: '2026-Q3', relevance: 'high' },
        { id: 'RM2', title: { he: 'חתימה דיגיטלית', en: 'Digital signature' },
          stage: 'planned', eta: '2026-Q4', relevance: 'medium' },
      ]),
    },
    issues: {
      getOpenFor: () => ([
        { id: 'ISS-1', title: { he: 'איטיות דוחות', en: 'Report latency' },
          severity: 'medium', status: 'open', eta: '2026-05-01',
          workaround: 'use filters' },
      ]),
    },
  };
}

function makeEngine(overrides = {}) {
  return new QBRGenerator({
    now: () => new Date(FIXED_NOW),
    store: createMemoryStore(),
    modules: makeModules(),
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────
// UTILITY — normalizeQuarter
// ──────────────────────────────────────────────────────────────────

test('normalizeQuarter — accepts "2026-Q1"', () => {
  const q = normalizeQuarter('2026-Q1');
  assert.equal(q.year, 2026);
  assert.equal(q.q, 1);
  assert.equal(q.label, '2026-Q1');
  assert.equal(q.start.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(q.end.toISOString(),   '2026-03-31T23:59:59.999Z');
});

test('normalizeQuarter — accepts { year, q }', () => {
  const q = normalizeQuarter({ year: 2026, q: 3 });
  assert.equal(q.label, '2026-Q3');
  assert.equal(q.start.toISOString(), '2026-07-01T00:00:00.000Z');
});

test('normalizeQuarter — accepts Q2-2026', () => {
  const q = normalizeQuarter('Q2-2026');
  assert.equal(q.label, '2026-Q2');
});

test('normalizeQuarter — rejects garbage', () => {
  assert.throws(() => normalizeQuarter('foo'), /invalid quarter/);
  assert.throws(() => normalizeQuarter({ year: 2026, q: 7 }), /invalid quarter number/);
  assert.throws(() => normalizeQuarter({ year: 1899, q: 1 }), /invalid quarter year/);
  assert.throws(() => normalizeQuarter(null), /quarter is required/);
});

// ──────────────────────────────────────────────────────────────────
// HEALTH SCORE
// ──────────────────────────────────────────────────────────────────

test('computeHealthScore — weighted average', () => {
  const s = computeHealthScore({
    usage: 80, sentiment: 80, support: 80, financial: 80, adoption: 80, sponsorship: 80,
  });
  assert.equal(s, 80);
});

test('computeHealthScore — missing inputs are ignored, not penalised', () => {
  const s1 = computeHealthScore({ usage: 100 });
  const s2 = computeHealthScore({ usage: 100, adoption: 100 });
  assert.equal(s1, 100);
  assert.equal(s2, 100);
});

test('bandOf — thresholds', () => {
  assert.equal(bandOf(95).key, 'healthy');
  assert.equal(bandOf(75).key, 'neutral');
  assert.equal(bandOf(55).key, 'at_risk');
  assert.equal(bandOf(30).key, 'critical');
});

// ──────────────────────────────────────────────────────────────────
// DATA PULL
// ──────────────────────────────────────────────────────────────────

test('pullData — aggregates all module sources', () => {
  const g = makeEngine();
  const data = g.pullData(CUSTOMER, Q);
  assert.equal(data.customerId, CUSTOMER);
  assert.equal(data.quarter.label, '2026-Q1');
  assert.equal(data.billing.arr, 144000);
  assert.equal(data.usage.activeUsers, 42);
  assert.equal(data.support.csat, 4.6);
  assert.equal(data.health.score, 82);
  assert.equal(data.plan.goals.length, 3);
  assert.equal(data.roadmap.length, 2);
  assert.equal(data.issues.length, 1);
  assert.equal(data.expansion.length, 2);
});

test('pullData — memoises on store (same key returns cached bundle)', () => {
  const g = makeEngine();
  const a = g.pullData(CUSTOMER, Q);
  const b = g.pullData(CUSTOMER, Q);
  assert.equal(a, b);   // identity equality proves cache hit
});

test('pullData — tolerates missing modules via stub fallbacks', () => {
  const g = new QBRGenerator({
    now: () => new Date(FIXED_NOW),
    store: createMemoryStore(),
    // no modules → stubs kick in
  });
  const data = g.pullData(CUSTOMER, Q);
  assert.equal(data.billing.currency, 'ILS');
  assert.equal(data.usage.activeUsers, 0);
  assert.equal(data.plan.goals.length, 0);
  assert.ok(data.health.score >= 0);
});

// ──────────────────────────────────────────────────────────────────
// EXEC SPONSOR
// ──────────────────────────────────────────────────────────────────

test('executiveSponsor — uses real sponsor when available', () => {
  const g = makeEngine();
  const s = g.executiveSponsor(CUSTOMER);
  assert.equal(s.name, 'Moshe Levy');
  assert.equal(s.title, 'CFO');
  assert.equal(s.verified, true);
});

test('executiveSponsor — returns placeholder with warning when missing', () => {
  const g = makeEngine({
    modules: { ...makeModules(), customers: {
      getCustomer: () => null,
      getExecSponsor: () => null,
    } },
  });
  const s = g.executiveSponsor(CUSTOMER);
  assert.equal(s.name, 'TBD');
  assert.equal(s.verified, false);
  assert.ok(s.warning.he.length > 0);
  assert.ok(s.warning.en.length > 0);
});

// ──────────────────────────────────────────────────────────────────
// SECTION ASSEMBLY
// ──────────────────────────────────────────────────────────────────

test('generateQBR — assembles all 11 default sections', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  assert.equal(qbr.sectionIds.length, SECTION_ORDER.length);
  for (const sec of SECTION_ORDER) {
    assert.ok(qbr.sections[sec], `missing section: ${sec}`);
  }
});

test('generateQBR — honours explicit section list', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({
    customerId: CUSTOMER,
    quarter: Q,
    sections: [SECTIONS.HEALTH_SCORE, SECTIONS.GOALS],
  });
  assert.deepEqual(qbr.sectionIds, [SECTIONS.HEALTH_SCORE, SECTIONS.GOALS]);
  assert.equal(Object.keys(qbr.sections).length, 2);
});

test('generateQBR — rejects unknown section id', () => {
  const g = makeEngine();
  assert.throws(
    () => g.generateQBR({ customerId: CUSTOMER, quarter: Q, sections: ['nope'] }),
    /unknown section: nope/,
  );
});

test('executive_summary section — bilingual bullets present', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const exec = qbr.sections[SECTIONS.EXECUTIVE_SUMMARY];
  assert.equal(exec.customerId, CUSTOMER);
  assert.ok(Array.isArray(exec.bullets.he));
  assert.ok(Array.isArray(exec.bullets.en));
  assert.equal(exec.bullets.he.length, exec.bullets.en.length);
  assert.ok(exec.headline.he.length > 0);
  assert.ok(exec.headline.en.length > 0);
});

test('usage_metrics section — captures activity & features', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const u = qbr.sections[SECTIONS.USAGE_METRICS];
  assert.equal(u.logins, 1840);
  assert.equal(u.activeUsers, 42);
  assert.equal(u.featuresCount, 6);
  assert.equal(u.topFeatures.length, 5);
  assert.equal(u.valueDelivered.amount, 280000);
});

test('business_impact section — computes ROI', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const b = qbr.sections[SECTIONS.BUSINESS_IMPACT];
  // benefit 280000, cost 144000 → ROI ≈ 94.4%
  assert.ok(b.roiPct > 90 && b.roiPct < 100);
  assert.equal(b.kpis.length, 2);
  assert.equal(b.currency, 'ILS');
});

test('support_summary section — open count + CSAT', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const s = qbr.sections[SECTIONS.SUPPORT_SUMMARY];
  assert.equal(s.opened, 18);
  assert.equal(s.closed, 16);
  assert.equal(s.open, 2);
  assert.equal(s.csat, 4.6);
  assert.equal(s.topCategories.length, 3);
});

test('health_score section — carries band + color', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const h = qbr.sections[SECTIONS.HEALTH_SCORE];
  assert.equal(h.score, 82);
  assert.equal(h.band.key, 'healthy');
  assert.equal(h.band.he, 'בריא');
  assert.ok(h.band.color.startsWith('#'));
});

test('goals section — counts by status', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const goals = qbr.sections[SECTIONS.GOALS];
  assert.equal(goals.total, 3);
  assert.equal(goals.counts.achieved, 1);
  assert.equal(goals.counts.in_progress, 1);
  assert.equal(goals.counts.at_risk, 1);
});

test('expansion section — sums ARR uplift', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const e = qbr.sections[SECTIONS.EXPANSION];
  assert.equal(e.count, 2);
  assert.equal(e.estimatedArrUplift, 36000);
});

test('roadmap, known_issues, asks_commitments, next_quarter_goals all populated', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  assert.equal(qbr.sections[SECTIONS.ROADMAP].items.length, 2);
  assert.equal(qbr.sections[SECTIONS.KNOWN_ISSUES].items.length, 1);
  assert.equal(qbr.sections[SECTIONS.ASKS_COMMITMENTS].asks.length, 1);
  assert.equal(qbr.sections[SECTIONS.ASKS_COMMITMENTS].previousCommitments.length, 1);
  assert.equal(qbr.sections[SECTIONS.NEXT_QUARTER_GOALS].items.length, 1);
  assert.equal(qbr.sections[SECTIONS.NEXT_QUARTER_GOALS].quarter, '2026-Q2');
});

// ──────────────────────────────────────────────────────────────────
// PDF / SLIDES / PREP
// ──────────────────────────────────────────────────────────────────

test('generatePDF — returns Palantir-themed payload with all pages', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const pdf = g.generatePDF(qbr.id);
  assert.equal(pdf.mimeType, 'application/pdf');
  assert.equal(pdf.theme, 'palantir');
  assert.equal(pdf.pageCount, 1 + SECTION_ORDER.length); // cover + sections
  assert.ok(pdf.filename.endsWith('.pdf'));
  assert.ok(Buffer.isBuffer(pdf.pdfBytes));
  assert.ok(pdf.pdfBytes.length > 0);
  assert.ok(pdf.textPreview.startsWith('%PDF-'));
  // bilingual heading present in body
  const body = pdf.pdfBytes.toString('utf8');
  assert.ok(body.includes('סקירה עסקית רבעונית') || body.includes('Quarterly Business Review'));
});

test('generateSlides — 1 title + N section + 1 closing', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const deck = g.generateSlides(qbr.id);
  assert.equal(deck.format, 'pptx-json');
  assert.equal(deck.slideCount, 1 + SECTION_ORDER.length + 1);
  assert.equal(deck.slides[0].layout, 'title');
  assert.equal(deck.slides[deck.slides.length - 1].layout, 'closing');
  // every content slide has a bilingual heading
  for (const s of deck.slides.slice(1, -1)) {
    assert.ok(s.heading.he);
    assert.ok(s.heading.en);
  }
});

test('prepMaterials — one-pager with sponsor, keyFacts, risks, talkingPoints', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const prep = g.prepMaterials(qbr.id);
  assert.equal(prep.type, 'prep-one-pager');
  assert.equal(prep.sponsor.name, 'Moshe Levy');
  assert.equal(prep.customerId, CUSTOMER);
  assert.ok(prep.keyFacts.length >= 5);
  assert.ok(Array.isArray(prep.talkingPoints));
  assert.ok(Array.isArray(prep.risks));
  // All keyFacts bilingual
  for (const f of prep.keyFacts) {
    assert.ok(f.he);
    assert.ok(f.en);
  }
});

test('prepMaterials — surfaces risks for low health + unverified sponsor', () => {
  const modules = makeModules();
  modules.health.getSnapshot = () => ({
    score: 45, metrics: { usage: 40, sentiment: 50, support: 50, financial: 50 },
  });
  modules.customers.getExecSponsor = () => null;
  const g = makeEngine({ modules });
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const prep = g.prepMaterials(qbr.id);
  const keys = prep.risks.map((r) => r.en).join(' | ');
  assert.match(keys, /health/i);
  assert.match(keys, /sponsor/i);
});

// ──────────────────────────────────────────────────────────────────
// COMMITMENTS
// ──────────────────────────────────────────────────────────────────

test('trackCommitments — append-only, returns list', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const initial = g.trackCommitments(qbr.id);
  assert.equal(initial.length, 0);

  g.trackCommitments(qbr.id, [
    { title: { he: 'הדרכה נוספת', en: 'Extra training' },
      owner: ACTION_OWNER.VENDOR, dueDate: '2026-05-01' },
    { title: { he: 'גישת SSO', en: 'SSO access' },
      owner: ACTION_OWNER.JOINT, dueDate: '2026-06-01' },
  ]);
  const list = g.trackCommitments(qbr.id);
  assert.equal(list.length, 2);
  // Every commitment has an id + createdAt + history
  for (const c of list) {
    assert.ok(c.id.startsWith('CMT-'));
    assert.equal(c.status, COMMITMENT_STATUS.OPEN);
    assert.ok(Array.isArray(c.history));
    assert.equal(c.history.length, 1);
  }
});

test('trackCommitments — multiple appends do not overwrite earlier entries', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  g.trackCommitments(qbr.id, { title: { he: 'ראשונה', en: 'First' } });
  g.trackCommitments(qbr.id, { title: { he: 'שנייה',  en: 'Second' } });
  g.trackCommitments(qbr.id, { title: { he: 'שלישית', en: 'Third' } });
  const list = g.trackCommitments(qbr.id);
  assert.equal(list.length, 3);
  assert.equal(list[0].title.en, 'First');
  assert.equal(list[2].title.en, 'Third');
});

test('store.updateCommitmentStatus — appends to history, never overwrites', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  g.trackCommitments(qbr.id, { title: { he: 'משימה', en: 'Task' } });
  const [c] = g.trackCommitments(qbr.id);
  g.store.updateCommitmentStatus(qbr.id, c.id, COMMITMENT_STATUS.IN_PROGRESS, 'started', 'csm');
  g.store.updateCommitmentStatus(qbr.id, c.id, COMMITMENT_STATUS.DONE,        'delivered', 'csm');
  const [updated] = g.trackCommitments(qbr.id);
  assert.equal(updated.status, COMMITMENT_STATUS.DONE);
  assert.equal(updated.history.length, 3);   // open + in_progress + done
  // Earliest history is still OPEN — proof of append-only
  assert.equal(updated.history[0].status, COMMITMENT_STATUS.OPEN);
});

// ──────────────────────────────────────────────────────────────────
// FOLLOW-UP ACTIONS
// ──────────────────────────────────────────────────────────────────

test('followUpActions — append-only', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  g.followUpActions(qbr.id, [
    { title: { he: 'שלח סיכום',   en: 'Send recap' },     owner: ACTION_OWNER.VENDOR },
    { title: { he: 'סקור חוזה', en: 'Review contract' }, owner: ACTION_OWNER.CUSTOMER },
  ]);
  const list = g.followUpActions(qbr.id);
  assert.equal(list.length, 2);
  assert.equal(list[0].status, COMMITMENT_STATUS.OPEN);
  assert.equal(list[0].owner, ACTION_OWNER.VENDOR);
});

// ──────────────────────────────────────────────────────────────────
// SCHEDULE NEXT QBR
// ──────────────────────────────────────────────────────────────────

test('scheduleNextQBR — rolls Q1 → Q2', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: '2026-Q1' });
  const sched = g.scheduleNextQBR(qbr.id);
  assert.equal(sched.nextQuarter, '2026-Q2');
  assert.equal(sched.status, 'scheduled');
  assert.ok(sched.scheduledFor.startsWith('2026-05-'));
});

test('scheduleNextQBR — rolls Q4 → next year Q1', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: '2026-Q4' });
  const sched = g.scheduleNextQBR(qbr.id);
  assert.equal(sched.nextQuarter, '2027-Q1');
  assert.ok(sched.scheduledFor.startsWith('2027-02-'));
});

test('scheduleNextQBR — supersede keeps earlier history', () => {
  const g = makeEngine();
  const qbr = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const s1 = g.scheduleNextQBR(qbr.id);
  const s2 = g.scheduleNextQBR(qbr.id);
  assert.ok(s2.history.length >= 3);   // s1.scheduled + s1.superseded + s2.scheduled
  assert.ok(s2.history.some((h) => h.status === 'superseded'));
});

// ──────────────────────────────────────────────────────────────────
// NEVER-DELETE RULE
// ──────────────────────────────────────────────────────────────────

test('createMemoryStore has no delete / remove / clear methods', () => {
  const s = createMemoryStore();
  assert.equal(typeof s.delete, 'undefined');
  assert.equal(typeof s.remove, 'undefined');
  assert.equal(typeof s.clear,  'undefined');
  // mutators are append-only: save, append, cache, set. No erase.
  const mutators = Object.keys(s).filter((k) => typeof s[k] === 'function');
  for (const k of mutators) {
    assert.ok(!/delete|remove|erase|clear|drop/i.test(k), `forbidden mutator: ${k}`);
  }
});

test('regenerating QBR supersedes the previous record — does not delete', () => {
  const g = makeEngine();
  const first = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  const second = g.generateQBR({ customerId: CUSTOMER, quarter: Q });
  // Both records must still be retrievable
  const all = g.store.listQBRs(CUSTOMER);
  assert.equal(all.length, 2);
  const prev = all.find((r) => r.id === first.id);
  const cur  = all.find((r) => r.id === second.id);
  assert.equal(prev.status, QBR_STATUS.SUPERSEDED);
  assert.equal(cur.status,  QBR_STATUS.ASSEMBLED);
  assert.equal(cur.supersedes, prev.id);
  // Previous record's history carries the supersede audit entry
  assert.ok(prev.history.some((h) => h.status === QBR_STATUS.SUPERSEDED));
});

// ──────────────────────────────────────────────────────────────────
// BILINGUAL COVERAGE
// ──────────────────────────────────────────────────────────────────

test('every LABEL entry ships he + en', () => {
  for (const [key, val] of Object.entries(LABELS)) {
    assert.ok(val && typeof val.he === 'string' && val.he.length > 0, `missing he on ${key}`);
    assert.ok(val && typeof val.en === 'string' && val.en.length > 0, `missing en on ${key}`);
  }
});

test('PALANTIR_THEME carries required tokens', () => {
  assert.ok(PALANTIR_THEME.colors.bg);
  assert.ok(PALANTIR_THEME.colors.accent);
  assert.ok(PALANTIR_THEME.fonts.he);
  assert.ok(PALANTIR_THEME.fonts.en);
  assert.ok(PALANTIR_THEME.type.bodyPt > 0);
});

// ──────────────────────────────────────────────────────────────────
// ERROR HANDLING
// ──────────────────────────────────────────────────────────────────

test('generateQBR — missing customerId throws', () => {
  const g = makeEngine();
  assert.throws(() => g.generateQBR({ quarter: Q }), /customerId required/);
});

test('generatePDF / generateSlides / prepMaterials — throw on unknown id', () => {
  const g = makeEngine();
  assert.throws(() => g.generatePDF('nope'),    /qbr not found/);
  assert.throws(() => g.generateSlides('nope'), /qbr not found/);
  assert.throws(() => g.prepMaterials('nope'),  /qbr not found/);
  assert.throws(() => g.trackCommitments('nope'), /qbr not found/);
  assert.throws(() => g.followUpActions('nope'), /qbr not found/);
  assert.throws(() => g.scheduleNextQBR('nope'), /qbr not found/);
});

// ══════════════════════════════════════════════════════════════════
// AGENT Y-104 EXTENSION — 10 standard slides, ROI, recommendations,
// archive, history, quarter comparison, renderHTML / renderPDF
// ══════════════════════════════════════════════════════════════════

const {
  SLIDE_SECTIONS,
  SLIDE_SECTION_ORDER,
  SLIDE_TITLES,
  RECOMMENDATION_RULES,
} = require('../../src/customer/qbr-generator.js');

// Fixture builder for the new-signature generateQBR({ period, usage, ... })
function newSpecArgs(overrides = {}) {
  return {
    customerId: 'CUST-002',
    period: '2026-Q1',
    goals: [
      { id: 'NG1', title: { he: 'אוטומציה', en: 'Automation' }, status: GOAL_STATUS.ACHIEVED,
        progressPct: 100 },
      { id: 'NG2', title: { he: 'הטמעה',   en: 'Onboarding' }, status: GOAL_STATUS.IN_PROGRESS,
        progressPct: 55 },
      { id: 'NG3', title: { he: 'SSO',     en: 'SSO' },         status: GOAL_STATUS.AT_RISK,
        progressPct: 20 },
    ],
    usage: {
      logins: 820,
      activeUsers: 18,
      activeUsersTrendPct: 12,
      eventsTotal: 6400,
      featuresUsed: ['invoices', 'po', 'reports'],
      valueDelivered: {
        amount: 0,
        currency: 'ILS',
        breakdown: { savings: 120000, revenue: 45000, efficiency: 30000 },
      },
    },
    support: {
      opened: 8, closed: 7, p1Count: 0, avgResolutionHours: 5.2,
      firstResponseHours: 0.9, csat: 4.8, nps: 62, escalations: 0,
      topCategories: [{ key: 'how-to', count: 4 }],
    },
    invoices: [
      { id: 'INV-1', amount: 12000, status: 'paid' },
      { id: 'INV-2', amount: 12000, status: 'paid' },
      { id: 'INV-3', amount: 12000, status: 'open' },
    ],
    surveys: [
      { id: 'SVY-1', csat: 5, nps: 70 },
      { id: 'SVY-2', csat: 4.5, nps: 55 },
    ],
    healthScore: 84,
    nps: 60,
    ...overrides,
  };
}

test('generateQBR(new-spec) — accepts period + usage/support/invoices/surveys', () => {
  const g = makeEngine();
  const qbr = g.generateQBR(newSpecArgs());
  assert.equal(qbr.customerId, 'CUST-002');
  assert.equal(qbr.quarter.label, '2026-Q1');
  assert.equal(qbr.status, QBR_STATUS.ASSEMBLED);
  // Usage merged into the assembled section
  assert.equal(qbr.sections[SECTIONS.USAGE_METRICS].activeUsers, 18);
  assert.equal(qbr.sections[SECTIONS.USAGE_METRICS].logins, 820);
  // Goals override the module plan
  assert.equal(qbr.sections[SECTIONS.GOALS].total, 3);
  // Health score merged
  assert.equal(qbr.sections[SECTIONS.HEALTH_SCORE].score, 84);
});

test('generateQBR end-to-end (new-spec) — bilingual labels across every section', () => {
  const g = makeEngine();
  const qbr = g.generateQBR(newSpecArgs());
  for (const sec of SECTION_ORDER) {
    const s = qbr.sections[sec];
    assert.ok(s, `missing ${sec}`);
    if (s.label) {
      assert.ok(s.label.he, `missing he label on ${sec}`);
      assert.ok(s.label.en, `missing en label on ${sec}`);
    }
  }
});

test('SLIDE_SECTION_ORDER has exactly 10 canonical sections', () => {
  assert.equal(SLIDE_SECTION_ORDER.length, 10);
  assert.deepEqual(SLIDE_SECTION_ORDER.slice(), [
    'executive-summary', 'goal-progress', 'usage-metrics', 'value-delivered',
    'roi-analysis', 'support-summary', 'nps-csat', 'roadmap-preview',
    'asks-from-customer', 'next-steps',
  ]);
});

test('buildSlide — produces a slide payload for every standard section', () => {
  const g = makeEngine();
  const qbr = g.generateQBR(newSpecArgs());
  const data = {
    customerId: qbr.customerId,
    quarter:    qbr.quarter.label,
    usage:      qbr.sections[SECTIONS.USAGE_METRICS],
    support:    qbr.sections[SECTIONS.SUPPORT_SUMMARY],
    health:     qbr.sections[SECTIONS.HEALTH_SCORE],
    billing:    qbr.data ? qbr.data.billing : { arr: 144000, currency: 'ILS', renewalDate: '2026-06-30' },
    goals:      qbr.sections[SECTIONS.GOALS].items,
    roadmap:    qbr.sections[SECTIONS.ROADMAP].items,
    asks:       qbr.sections[SECTIONS.ASKS_COMMITMENTS].asks,
  };
  for (const key of SLIDE_SECTION_ORDER) {
    const slide = g.buildSlide(key, data);
    assert.equal(slide.sectionKey, key);
    assert.ok(slide.title.he, `missing he title on ${key}`);
    assert.ok(slide.title.en, `missing en title on ${key}`);
    assert.ok(Array.isArray(slide.body.he));
    assert.ok(Array.isArray(slide.body.en));
    assert.equal(slide.theme.bg, '#0b0d10');
    assert.equal(slide.theme.accent, '#4a9eff');
  }
});

test('buildSlide — rejects unknown section key', () => {
  const g = makeEngine();
  assert.throws(() => g.buildSlide('not-a-section', {}), /unknown slide section/);
  assert.throws(() => g.buildSlide(null, {}), /sectionKey required/);
});

test('valueDelivered — sums savings + revenue + efficiency', () => {
  const g = makeEngine();
  const data = {
    usage: { valueDelivered: { breakdown: { savings: 100000, revenue: 50000, efficiency: 25000 }, currency: 'ILS' } },
    billing: { currency: 'ILS' },
  };
  const v = g.valueDelivered('CUST-002', '2026-Q1', data);
  assert.equal(v.savings, 100000);
  assert.equal(v.revenue, 50000);
  assert.equal(v.efficiency, 25000);
  assert.equal(v.total, 175000);
  assert.equal(v.currency, 'ILS');
  assert.match(v.formula, /savings \+ revenue \+ efficiency/);
});

test('valueDelivered — flat amount falls back to savings bucket', () => {
  const g = makeEngine();
  const v = g.valueDelivered(null, null, {
    usage: { valueDelivered: { amount: 90000, currency: 'ILS', unit: 'savings' } },
  });
  assert.equal(v.savings, 90000);
  assert.equal(v.revenue, 0);
  assert.equal(v.total, 90000);
});

test('goalProgress — % achieved per goal + overall average', () => {
  const g = makeEngine();
  const progress = g.goalProgress('CUST-002', [
    { id: 'A', status: GOAL_STATUS.ACHIEVED,    progressPct: 100 },
    { id: 'B', status: GOAL_STATUS.IN_PROGRESS, progressPct: 60 },
    { id: 'C', status: GOAL_STATUS.AT_RISK,     progressPct: 20 },
  ]);
  assert.equal(progress.total, 3);
  assert.equal(progress.counts.achieved, 1);
  assert.equal(progress.counts.in_progress, 1);
  assert.equal(progress.counts.at_risk, 1);
  assert.equal(progress.overallPct, 60);
  assert.equal(progress.perGoal[0].achievedPct, 100);
  assert.ok(progress.perGoal[0].statusHe);
  assert.ok(progress.perGoal[0].statusEn);
});

test('goalProgress — empty list is tolerated (0% overall)', () => {
  const g = makeEngine();
  const progress = g.goalProgress('CUST-002', []);
  assert.equal(progress.total, 0);
  assert.equal(progress.overallPct, 0);
});

test('supportSummary — tickets/resolution/CSAT block', () => {
  const g = makeEngine();
  const summary = g.supportSummary('CUST-002', '2026-Q1', {
    support: { opened: 15, closed: 12, p1Count: 2, avgResolutionHours: 6.0, csat: 4.4, nps: 48, escalations: 1 },
  });
  assert.equal(summary.opened, 15);
  assert.equal(summary.closed, 12);
  assert.equal(summary.open, 3);
  assert.equal(summary.p1Count, 2);
  assert.equal(summary.avgResolutionHours, 6.0);
  assert.equal(summary.csat, 4.4);
  assert.equal(summary.nps, 48);
});

test('recommendations — high NPS triggers advocacy ask', () => {
  const g = makeEngine();
  const qbr = { usage: { activeUsers: 40 }, support: { nps: 62, opened: 5 }, billing: {} };
  const recs = g.recommendations(qbr);
  const rules = recs.map((r) => r.rule);
  assert.ok(rules.includes(RECOMMENDATION_RULES.ADVOCACY));
  const advocacy = recs.find((r) => r.rule === RECOMMENDATION_RULES.ADVOCACY);
  assert.ok(advocacy.title.he);
  assert.ok(advocacy.title.en);
});

test('recommendations — low usage triggers training offer', () => {
  const g = makeEngine();
  const qbr = { usage: { activeUsers: 4 }, support: { nps: 20, opened: 3 }, billing: {} };
  const rules = g.recommendations(qbr).map((r) => r.rule);
  assert.ok(rules.includes(RECOMMENDATION_RULES.TRAINING));
});

test('recommendations — high ticket volume triggers health check', () => {
  const g = makeEngine();
  const qbr = { usage: { activeUsers: 40 }, support: { nps: 30, opened: 25 }, billing: {} };
  const rules = g.recommendations(qbr).map((r) => r.rule);
  assert.ok(rules.includes(RECOMMENDATION_RULES.HEALTH_CHECK));
});

test('recommendations — renewal soon triggers renewal conversation', () => {
  const g = makeEngine();
  // FIXED_NOW = 2026-04-11; renewal 60 days out → 2026-06-10
  const qbr = {
    usage: { activeUsers: 40 },
    support: { nps: 30, opened: 5 },
    billing: { renewalDate: '2026-06-10' },
  };
  const recs = g.recommendations(qbr);
  const renewal = recs.find((r) => r.rule === RECOMMENDATION_RULES.RENEWAL);
  assert.ok(renewal, 'expected a renewal recommendation');
  assert.equal(renewal.priority, 'critical');
});

test('recommendations — no trigger means empty list', () => {
  const g = makeEngine();
  const qbr = { usage: { activeUsers: 40 }, support: { nps: 30, opened: 5 }, billing: {} };
  const recs = g.recommendations(qbr);
  assert.equal(recs.length, 0);
});

test('renderHTML — self-contained deck with Palantir dark theme + RTL Hebrew primary', () => {
  const g = makeEngine();
  const qbr = g.generateQBR(newSpecArgs());
  const html = g.renderHTML(qbr, { theme: 'palantir-dark' });
  // Document-level RTL
  assert.match(html, /<html lang="he" dir="rtl">/);
  // Palette tokens present inline
  assert.ok(html.includes('#0b0d10'));
  assert.ok(html.includes('#13171c'));
  assert.ok(html.includes('#4a9eff'));
  // Bilingual cover & Hebrew title
  assert.ok(html.includes('סקירה עסקית רבעונית'));
  assert.ok(html.includes('Quarterly Business Review'));
  // Every standard slide title should appear in the deck
  for (const key of SLIDE_SECTION_ORDER) {
    const title = SLIDE_TITLES[key];
    assert.ok(html.includes(title.he) || html.includes(title.en),
      `missing slide title for ${key}`);
  }
});

test('renderHTML — contains dir="rtl" and dir="ltr" side-by-side columns', () => {
  const g = makeEngine();
  const qbr = g.generateQBR(newSpecArgs());
  const html = g.renderHTML(qbr);
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes('dir="ltr"'));
  assert.ok(html.includes('lang="he"'));
  assert.ok(html.includes('lang="en"'));
});

test('renderPDF — structured payload with cover + 10 content pages', () => {
  const g = makeEngine();
  const qbr = g.generateQBR(newSpecArgs());
  const pdf = g.renderPDF(qbr);
  assert.equal(pdf.format, 'palantir-dark-pdf');
  assert.equal(pdf.mimeType, 'application/pdf');
  assert.equal(pdf.pageCount, 11);  // cover + 10 slides
  assert.equal(pdf.pages[0].type, 'cover');
  assert.equal(pdf.pages[1].type, 'content');
  // First content page is executive-summary
  assert.equal(pdf.pages[1].sectionKey, 'executive-summary');
  // Last content page is next-steps
  assert.equal(pdf.pages[pdf.pages.length - 1].sectionKey, 'next-steps');
  // Palette preserved
  assert.equal(pdf.palette.bg, '#0b0d10');
  assert.equal(pdf.palette.accent, '#4a9eff');
});

test('archiveQBR — preserves record, only flips status & appends history', () => {
  const g = makeEngine();
  const qbr = g.generateQBR(newSpecArgs());
  const beforeHistoryLen = qbr.history.length;
  const archived = g.archiveQBR(qbr.id);
  assert.equal(archived.archived, true);
  assert.equal(archived.status, QBR_STATUS.ARCHIVED);
  assert.equal(archived.history.length, beforeHistoryLen + 1);
  assert.equal(archived.history[archived.history.length - 1].status, QBR_STATUS.ARCHIVED);
  // Body preserved — sections are still the same object
  assert.ok(archived.sections[SECTIONS.EXECUTIVE_SUMMARY]);
  assert.ok(archived.sections[SECTIONS.USAGE_METRICS]);
  // Record is still retrievable from the store — not deleted
  assert.equal(g.store.getQBR(qbr.id).id, qbr.id);
});

test('history — returns all past QBRs ordered by createdAt (append-only)', () => {
  const g = makeEngine();
  const q1 = g.generateQBR({ ...newSpecArgs({ customerId: 'CUST-003', period: '2025-Q4' }) });
  const q2 = g.generateQBR({ ...newSpecArgs({ customerId: 'CUST-003', period: '2026-Q1' }) });
  g.archiveQBR(q1.id);
  const hist = g.history('CUST-003');
  assert.ok(hist.length >= 2);
  const ids = hist.map((r) => r.id);
  assert.ok(ids.includes(q1.id));
  assert.ok(ids.includes(q2.id));
  // Archived one is still present
  const archived = hist.find((r) => r.id === q1.id);
  assert.equal(archived.status, QBR_STATUS.ARCHIVED);
});

test('history — missing customerId throws', () => {
  const g = makeEngine();
  assert.throws(() => g.history(), /customerId required/);
});

test('compareQuarters — delta on usage, support, health', () => {
  const g = makeEngine();
  g.generateQBR({ ...newSpecArgs({ customerId: 'CUST-004', period: '2025-Q4',
    usage: { logins: 500, activeUsers: 10, featuresUsed: ['a','b'], eventsTotal: 1000,
      valueDelivered: { amount: 50000, currency: 'ILS', unit: 'savings' } },
    support: { opened: 20, closed: 18, csat: 4.0, nps: 30 },
    healthScore: 65 }) });
  g.generateQBR({ ...newSpecArgs({ customerId: 'CUST-004', period: '2026-Q1',
    usage: { logins: 800, activeUsers: 22, featuresUsed: ['a','b','c','d'], eventsTotal: 3500,
      valueDelivered: { amount: 120000, currency: 'ILS', unit: 'savings' } },
    support: { opened: 10, closed: 10, csat: 4.7, nps: 55 },
    healthScore: 88 }) });

  const cmp = g.compareQuarters('CUST-004', '2025-Q4', '2026-Q1');
  assert.equal(cmp.from, '2025-Q4');
  assert.equal(cmp.to,   '2026-Q1');
  assert.equal(cmp.usage.activeUsers.from, 10);
  assert.equal(cmp.usage.activeUsers.to,   22);
  assert.equal(cmp.usage.activeUsers.delta, 12);
  assert.equal(cmp.support.nps.from, 30);
  assert.equal(cmp.support.nps.to,   55);
  assert.equal(cmp.support.nps.delta, 25);
  assert.equal(cmp.health.score.from, 65);
  assert.equal(cmp.health.score.to,   88);
  assert.equal(cmp.health.score.delta, 23);
  assert.ok(cmp.labels.he.title.includes('השוואה'));
  assert.ok(cmp.labels.en.title.includes('comparison'));
});

test('compareQuarters — missing args throw', () => {
  const g = makeEngine();
  assert.throws(() => g.compareQuarters('CUST-X'), /both quarters required/);
  assert.throws(() => g.compareQuarters(null, '2026-Q1', '2026-Q2'), /customerId required/);
});
