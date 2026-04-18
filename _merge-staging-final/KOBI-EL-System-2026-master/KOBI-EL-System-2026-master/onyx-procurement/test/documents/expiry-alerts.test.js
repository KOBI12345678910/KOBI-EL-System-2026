/**
 * Document Expiry Alerting System — Unit Tests
 * Agent Y-110 / Swarm Documents / Techno-Kol Uzi Mega-ERP 2026
 *
 * Covers:
 *   - registerDocument (append-only + catalog-driven expiry)
 *   - listExpiring     (expiring-within-N-days filter + sorting + type/owner)
 *   - alertCadence     (escalating reminder offsets)
 *   - pendingAlerts    (tier selection at the cadence offsets 180/90/60/30/14/7/1)
 *   - sendAlert        (bilingual email/SMS, ledger append-only)
 *   - renewalWorkflow  (pending state + insurance-specific quote step)
 *   - gracePeriods     (read/write, default per category)
 *   - expiredDocsRegister (expired rows retained forever)
 *   - autoRenewal      (flag + conditions)
 *   - complianceReport (gap detection, renewed-on-time vs late)
 *   - dashboardData    (red/yellow/green buckets)
 *   - bulkRenewalRequest (mass renewal initiation for a type/period)
 *   - "never delete" invariant — supersede chain preserves old rows.
 *
 * Run with: node --test test/documents/expiry-alerts.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ExpiryAlertSystem,
  DOC_CATALOG,
  DOC_TYPES,
  DEFAULT_OFFSETS,
  DEFAULT_GRACE,
  STATUS,
  URGENCY,
} = require('../../src/documents/expiry-alerts.js');

// ─── fixed clock helpers ─────────────────────────────────────────────
const FIXED_NOW_ISO = '2026-04-11T09:00:00Z';
const clockAt = (iso) => () => new Date(iso);

function makeSystem(nowIso = FIXED_NOW_ISO) {
  return new ExpiryAlertSystem({ now: clockAt(nowIso) });
}

// ══════════════════════════════════════════════════════════════════════
// registerDocument
// ══════════════════════════════════════════════════════════════════════

describe('registerDocument', () => {
  test('explicit expiryDate is honored', () => {
    const sys = makeSystem();
    const rec = sys.registerDocument({
      docId: 'doc-001',
      type: 'license',
      typeCode: 'RISHUY_ESEK',
      expiryDate: '2026-12-31',
      owner: 'kobi-el',
      renewalContact: 'legal@technokol.co.il',
    });
    assert.equal(rec.expiryDate, '2026-12-31');
    assert.equal(rec.owner, 'kobi-el');
    assert.equal(rec.typeCode, 'RISHUY_ESEK');
    assert.equal(rec.labels.he, 'רישיון עסק');
    assert.equal(rec.labels.en, 'Business Licence');
    assert.equal(rec.critical, true);
  });

  test('catalog-driven expiry when only issueDate + typeCode supplied', () => {
    const sys = makeSystem();
    const rec = sys.registerDocument({
      docId: 'doc-002',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      issueDate: '2026-01-01',
      owner: 'finance',
    });
    // 12-month validity → 2027-01-01
    assert.equal(rec.expiryDate, '2027-01-01');
    assert.equal(rec.renewalLeadDays, 60);
  });

  test('throws when neither expiryDate nor catalog+issueDate is provided', () => {
    const sys = makeSystem();
    assert.throws(
      () =>
        sys.registerDocument({
          docId: 'doc-003',
          type: 'certificate',
          owner: 'qa',
        }),
      /expiryDate is required/,
    );
  });

  test('rejects unknown type', () => {
    const sys = makeSystem();
    assert.throws(
      () =>
        sys.registerDocument({
          docId: 'doc-004',
          type: 'wizardry',
          expiryDate: '2027-01-01',
          owner: 'kobi',
        }),
      /type must be one of/,
    );
  });

  test('rejects duplicate docId (never delete)', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'doc-dup',
      type: 'license',
      expiryDate: '2027-01-01',
      owner: 'kobi',
    });
    assert.throws(
      () =>
        sys.registerDocument({
          docId: 'doc-dup',
          type: 'license',
          expiryDate: '2028-01-01',
          owner: 'kobi',
        }),
      /already registered/,
    );
  });

  test('supersede chain preserves the old row', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'ins-2025',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2026-05-01',
      owner: 'finance',
    });
    sys.registerDocument({
      docId: 'ins-2026',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2027-05-01',
      owner: 'finance',
      supersedes: 'ins-2025',
    });
    const old = sys.getDocument('ins-2025');
    assert.equal(old.status, STATUS.SUPERSEDED);
    assert.equal(old.supersededBy, 'ins-2026');
    assert.equal(sys.listDocuments().length, 2);
  });
});

// ══════════════════════════════════════════════════════════════════════
// listExpiring
// ══════════════════════════════════════════════════════════════════════

describe('listExpiring', () => {
  function seed(sys) {
    sys.registerDocument({
      docId: 'esek-1',
      type: 'license',
      typeCode: 'RISHUY_ESEK',
      expiryDate: '2026-05-01', // 20 days from fixed-now
      owner: 'kobi',
    });
    sys.registerDocument({
      docId: 'iso-1',
      type: 'certificate',
      typeCode: 'ISO_9001',
      expiryDate: '2026-07-10', // 90 days from fixed-now
      owner: 'qa',
    });
    sys.registerDocument({
      docId: 'ins-1',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2026-08-15', // 126 days
      owner: 'finance',
    });
    sys.registerDocument({
      docId: 'darkon-1',
      type: 'passport',
      typeCode: 'DARKON',
      expiryDate: '2030-04-11',
      owner: 'ceo',
    });
  }

  test('returns only docs expiring within N days, sorted soonest first', () => {
    const sys = makeSystem();
    seed(sys);
    const res = sys.listExpiring({ days: 90 });
    const ids = res.map((r) => r.docId);
    assert.deepEqual(ids, ['esek-1', 'iso-1']);
    assert.ok(res[0].daysOut <= res[1].daysOut);
  });

  test('filters by type', () => {
    const sys = makeSystem();
    seed(sys);
    const res = sys.listExpiring({ days: 200, type: 'insurance' });
    assert.equal(res.length, 1);
    assert.equal(res[0].docId, 'ins-1');
  });

  test('filters by owner', () => {
    const sys = makeSystem();
    seed(sys);
    const res = sys.listExpiring({ days: 365, owner: 'finance' });
    assert.equal(res.length, 1);
    assert.equal(res[0].owner, 'finance');
  });

  test('skips superseded docs', () => {
    const sys = makeSystem();
    seed(sys);
    sys.registerDocument({
      docId: 'esek-2',
      type: 'license',
      typeCode: 'RISHUY_ESEK',
      expiryDate: '2031-05-01',
      owner: 'kobi',
      supersedes: 'esek-1',
    });
    const res = sys.listExpiring({ days: 90 });
    assert.equal(res.length, 1);
    assert.equal(res[0].docId, 'iso-1');
  });
});

// ══════════════════════════════════════════════════════════════════════
// alertCadence + pendingAlerts
// ══════════════════════════════════════════════════════════════════════

describe('alertCadence / pendingAlerts', () => {
  test('default cadence is 180/90/60/30/14/7/1', () => {
    const sys = makeSystem();
    const cadence = sys.alertCadence({ type: 'license' });
    assert.deepEqual(cadence.offsets, [180, 90, 60, 30, 14, 7, 1]);
  });

  test('cadence can be overridden per type and is stored descending', () => {
    const sys = makeSystem();
    const res = sys.alertCadence({ type: 'insurance', offsets: [1, 30, 7, 60] });
    assert.deepEqual(res.offsets, [60, 30, 7, 1]);
  });

  test('pendingAlerts picks the smallest tier >= daysOut', () => {
    const sys = makeSystem();
    // expiry 45 days out → nearest tier at or above 45 in the default
    // cadence [180,90,60,30,14,7,1] is 60.
    sys.registerDocument({
      docId: 'iso-45',
      type: 'certificate',
      typeCode: 'ISO_9001',
      expiryDate: '2026-05-26', // 45 days from 2026-04-11
      owner: 'qa',
    });
    const fires = sys.pendingAlerts({ asOf: FIXED_NOW_ISO });
    assert.equal(fires.length, 1);
    assert.equal(fires[0].tier, 60);
    assert.equal(fires[0].daysOut, 45);
    assert.equal(fires[0].urgency, URGENCY.YELLOW);
  });

  test('pendingAlerts fires every offset bucket as time advances', () => {
    // Create 7 docs whose expiry equals exactly each offset in the default
    // cadence, and check that each falls into a distinct tier.
    const sys = makeSystem();
    const now = new Date(FIXED_NOW_ISO);
    const MS = 86_400_000;
    const offsets = [180, 90, 60, 30, 14, 7, 1];
    offsets.forEach((off, idx) => {
      const exp = new Date(now.getTime() + off * MS).toISOString().slice(0, 10);
      sys.registerDocument({
        docId: `doc-${off}`,
        type: 'license',
        expiryDate: exp,
        owner: 'kobi',
      });
    });
    const fires = sys.pendingAlerts({ asOf: FIXED_NOW_ISO });
    const tiers = fires.map((f) => f.tier).sort((a, b) => a - b);
    assert.deepEqual(tiers, [1, 7, 14, 30, 60, 90, 180]);
  });
});

// ══════════════════════════════════════════════════════════════════════
// sendAlert
// ══════════════════════════════════════════════════════════════════════

describe('sendAlert', () => {
  test('bilingual message with expiry count-down and audit ledger', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'esek-1',
      type: 'license',
      typeCode: 'RISHUY_ESEK',
      expiryDate: '2026-05-01',
      owner: 'kobi',
    });
    const entry = sys.sendAlert({
      docId: 'esek-1',
      recipients: ['legal@technokol.co.il'],
      channel: 'email',
    });
    assert.equal(entry.docId, 'esek-1');
    assert.equal(entry.daysOut, 20);
    assert.match(entry.message.body.he, /20 ימים/);
    assert.match(entry.message.body.en, /20 days/);
    assert.equal(entry.message.subject.he, 'התראת תפוגה: רישיון עסק');

    const history = sys.alertHistory('esek-1');
    assert.equal(history.length, 1);
  });

  test('bilingual message for expired (past-tense) documents', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'iso-old',
      type: 'certificate',
      expiryDate: '2026-03-01', // 41 days before fixed-now
      owner: 'qa',
    });
    const entry = sys.sendAlert({
      docId: 'iso-old',
      recipients: ['qa@technokol.co.il'],
    });
    assert.ok(entry.daysOut < 0);
    assert.match(entry.message.body.he, /פג תוקף/);
    assert.match(entry.message.body.en, /expired/);
  });

  test('throws on empty recipients', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'doc-1',
      type: 'license',
      expiryDate: '2027-01-01',
      owner: 'kobi',
    });
    assert.throws(() => sys.sendAlert({ docId: 'doc-1', recipients: [] }), /recipients/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// renewalWorkflow
// ══════════════════════════════════════════════════════════════════════

describe('renewalWorkflow', () => {
  test('initiates a pending renewal with the right steps', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'ins-1',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2026-06-01',
      owner: 'finance',
    });
    const wf = sys.renewalWorkflow('ins-1');
    assert.equal(wf.status, STATUS.RENEWAL_PENDING);
    const keys = wf.steps.map((s) => s.key);
    assert.ok(keys.includes('compare-quotes'));
    assert.ok(keys.includes('register-new-document'));
  });

  test('idempotent: a second call returns the same pending workflow', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'lic-1',
      type: 'license',
      expiryDate: '2026-06-01',
      owner: 'kobi',
    });
    const wf1 = sys.renewalWorkflow('lic-1');
    const wf2 = sys.renewalWorkflow('lic-1');
    assert.equal(wf1.startedAt, wf2.startedAt);
  });

  test('drivers-license flow adds medical clearance step', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'rn-1',
      type: 'drivers-license',
      typeCode: 'RISHUY_NEHIGA',
      expiryDate: '2026-06-01',
      owner: 'dror',
    });
    const wf = sys.renewalWorkflow('rn-1');
    const keys = wf.steps.map((s) => s.key);
    assert.ok(keys.includes('medical-clearance'));
  });
});

// ══════════════════════════════════════════════════════════════════════
// gracePeriods
// ══════════════════════════════════════════════════════════════════════

describe('gracePeriods', () => {
  test('default grace per category matches DEFAULT_GRACE', () => {
    const sys = makeSystem();
    assert.equal(sys.gracePeriods({ type: 'license' }), 30);
    assert.equal(sys.gracePeriods({ type: 'insurance' }), 0);
    assert.equal(sys.gracePeriods({ type: 'permit' }), 0);
  });

  test('override grace and read it back', () => {
    const sys = makeSystem();
    sys.gracePeriods({ type: 'contract', days: 14 });
    assert.equal(sys.gracePeriods({ type: 'contract' }), 14);
  });

  test('expired-in-grace license still listed but flagged inGrace=true', () => {
    const sys = makeSystem();
    // business licence expired 10 days ago; default grace is 30 → inGrace
    sys.registerDocument({
      docId: 'esek-1',
      type: 'license',
      typeCode: 'RISHUY_ESEK',
      expiryDate: '2026-04-01',
      owner: 'kobi',
    });
    const expired = sys.expiredDocsRegister({ asOf: FIXED_NOW_ISO });
    assert.equal(expired.length, 1);
    assert.equal(expired[0].inGrace, true);
    assert.equal(expired[0].status, STATUS.GRACE);
    assert.equal(expired[0].graceDaysRemaining, 20); // 30 - 10
  });

  test('insurance has zero grace → expired is not in grace', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'ins-old',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2026-03-01',
      owner: 'finance',
    });
    const expired = sys.expiredDocsRegister({ asOf: FIXED_NOW_ISO });
    assert.equal(expired.length, 1);
    assert.equal(expired[0].inGrace, false);
    assert.equal(expired[0].status, STATUS.EXPIRED);
  });
});

// ══════════════════════════════════════════════════════════════════════
// expiredDocsRegister
// ══════════════════════════════════════════════════════════════════════

describe('expiredDocsRegister', () => {
  test('retains expired docs forever (never-delete invariant)', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'old-1',
      type: 'permit',
      expiryDate: '2024-01-01',
      owner: 'ops',
    });
    sys.registerDocument({
      docId: 'fresh-1',
      type: 'permit',
      expiryDate: '2027-01-01',
      owner: 'ops',
    });
    const expired = sys.expiredDocsRegister({ asOf: FIXED_NOW_ISO });
    assert.equal(expired.length, 1);
    assert.equal(expired[0].docId, 'old-1');
    // All docs are still in the register.
    assert.equal(sys.listDocuments().length, 2);
  });
});

// ══════════════════════════════════════════════════════════════════════
// autoRenewal
// ══════════════════════════════════════════════════════════════════════

describe('autoRenewal', () => {
  test('flag a doc for auto-renewal with conditions', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'ins-1',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2026-06-01',
      owner: 'finance',
    });
    const flag = sys.autoRenewal({
      docId: 'ins-1',
      enabled: true,
      conditions: { priceIncreaseCapPct: 7, sameInsurer: true },
    });
    assert.equal(flag.enabled, true);
    assert.equal(flag.conditions.priceIncreaseCapPct, 7);
    assert.equal(sys.getAutoRenewal('ins-1').enabled, true);
  });

  test('throws on unknown docId', () => {
    const sys = makeSystem();
    assert.throws(
      () => sys.autoRenewal({ docId: 'ghost', enabled: true }),
      /unknown docId/,
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// complianceReport
// ══════════════════════════════════════════════════════════════════════

describe('complianceReport', () => {
  test('classifies rows into renewedOnTime, renewedLate, expired, gaps', () => {
    const sys = makeSystem('2026-12-31T12:00:00Z');
    // Renewed on time: expired 2026-05-01, superseded by 2026-04-15 row.
    sys.registerDocument({
      docId: 'a-old',
      type: 'license',
      typeCode: 'RISHUY_ESEK',
      expiryDate: '2026-05-01',
      owner: 'kobi',
    });
    const a2 = sys.registerDocument({
      docId: 'a-new',
      type: 'license',
      typeCode: 'RISHUY_ESEK',
      expiryDate: '2031-05-01',
      owner: 'kobi',
      supersedes: 'a-old',
    });
    // Force registeredAt for deterministic comparison.
    a2.registeredAt = '2026-04-15T09:00:00Z';
    sys._docs.get('a-new').registeredAt = '2026-04-15T09:00:00Z';

    // Renewed late.
    sys.registerDocument({
      docId: 'b-old',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2026-06-01',
      owner: 'finance',
    });
    sys.registerDocument({
      docId: 'b-new',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2027-06-01',
      owner: 'finance',
      supersedes: 'b-old',
    });
    sys._docs.get('b-new').registeredAt = '2026-07-01T09:00:00Z';

    // Expired no-renewal, critical → also shows in gaps.
    sys.registerDocument({
      docId: 'c-expired',
      type: 'permit',
      typeCode: 'HETER_REALIM',
      expiryDate: '2026-08-01',
      owner: 'safety',
    });

    const report = sys.complianceReport({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    assert.equal(report.totals.renewedOnTime, 1);
    assert.equal(report.totals.renewedLate, 1);
    assert.equal(report.totals.expired, 1);
    assert.ok(report.totals.gaps >= 1);
    assert.ok(report.renewalRate > 0 && report.renewalRate < 1);
  });

  test('critical expired doc surfaces as a gap', () => {
    const sys = makeSystem('2026-12-31T12:00:00Z');
    sys.registerDocument({
      docId: 'crit-1',
      type: 'permit',
      typeCode: 'HETER_PELITOT', // critical: true, graceDays: 0
      expiryDate: '2026-08-01',
      owner: 'safety',
    });
    const report = sys.complianceReport({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    assert.ok(report.gaps.some((g) => g.docId === 'crit-1'));
  });
});

// ══════════════════════════════════════════════════════════════════════
// dashboardData
// ══════════════════════════════════════════════════════════════════════

describe('dashboardData', () => {
  test('groups docs into red/yellow/green buckets', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'red-1',
      type: 'license',
      expiryDate: '2026-04-25', // 14 days
      owner: 'kobi',
    });
    sys.registerDocument({
      docId: 'yellow-1',
      type: 'certificate',
      expiryDate: '2026-06-20', // 70 days
      owner: 'qa',
    });
    sys.registerDocument({
      docId: 'green-1',
      type: 'passport',
      expiryDate: '2030-04-11', // ~4 years
      owner: 'ceo',
    });
    const dash = sys.dashboardData();
    assert.equal(dash.counts.red, 1);
    assert.equal(dash.counts.yellow, 1);
    assert.equal(dash.counts.green, 1);
    assert.equal(dash.red[0].docId, 'red-1');
    assert.equal(dash.yellow[0].docId, 'yellow-1');
    assert.equal(dash.green[0].docId, 'green-1');
  });
});

// ══════════════════════════════════════════════════════════════════════
// bulkRenewalRequest
// ══════════════════════════════════════════════════════════════════════

describe('bulkRenewalRequest', () => {
  test('mass-initiates renewals for a type in a period', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'ins-a',
      type: 'insurance',
      typeCode: 'BITUACH_CHAVUYOT',
      expiryDate: '2026-06-01',
      owner: 'finance',
    });
    sys.registerDocument({
      docId: 'ins-b',
      type: 'insurance',
      typeCode: 'BITUACH_MIKTZOIT',
      expiryDate: '2026-07-15',
      owner: 'finance',
    });
    sys.registerDocument({
      docId: 'lic-a',
      type: 'license',
      expiryDate: '2026-06-15',
      owner: 'kobi',
    });
    const result = sys.bulkRenewalRequest({
      type: 'insurance',
      period: { from: '2026-04-11', to: '2026-09-30' },
    });
    assert.equal(result.initiated.length, 2);
    assert.equal(result.skipped.length, 0);
    const ids = result.initiated.map((r) => r.docId).sort();
    assert.deepEqual(ids, ['ins-a', 'ins-b']);
  });

  test('skips docs already in renewal-pending', () => {
    const sys = makeSystem();
    sys.registerDocument({
      docId: 'ins-a',
      type: 'insurance',
      expiryDate: '2026-06-01',
      owner: 'finance',
    });
    sys.renewalWorkflow('ins-a');
    const result = sys.bulkRenewalRequest({
      type: 'insurance',
      period: { from: '2026-04-11', to: '2026-12-31' },
    });
    assert.equal(result.initiated.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].reason, 'already-pending');
  });
});

// ══════════════════════════════════════════════════════════════════════
// Israeli catalog sanity
// ══════════════════════════════════════════════════════════════════════

describe('Israeli DOC_CATALOG', () => {
  test('includes all promised Israeli doc types', () => {
    const must = [
      'RISHUY_ESEK',
      'HETER_PELITOT',
      'HETER_REALIM',
      'ISO_9001',
      'ISO_14001',
      'ISO_45001',
      'BITUACH_CHAVUYOT',
      'BITUACH_MIKTZOIT',
      'BITUACH_RECHUSH',
      'BITUACH_RECHEV',
      'RISHUY_MEHANDES',
      'RISHUY_HANDASAI',
      'RISHUY_NEHIGA',
      'RISHUY_RECHEV',
      'SHIABUD',
    ];
    for (const code of must) {
      assert.ok(DOC_CATALOG[code], `catalog missing ${code}`);
      assert.ok(DOC_CATALOG[code].he, `catalog row ${code} missing Hebrew label`);
      assert.ok(DOC_CATALOG[code].en, `catalog row ${code} missing English label`);
      assert.ok(DOC_CATALOG[code].law, `catalog row ${code} missing legal citation`);
    }
  });

  test('DOC_TYPES covers every requested enum value', () => {
    const must = [
      'contract',
      'license',
      'certificate',
      'insurance',
      'permit',
      'warranty',
      'lease',
      'nda',
      'passport',
      'visa',
      'drivers-license',
    ];
    for (const t of must) assert.ok(DOC_TYPES.includes(t), `missing type ${t}`);
  });

  test('DEFAULT_OFFSETS are the escalating reminder cadence', () => {
    assert.deepEqual(
      [...DEFAULT_OFFSETS],
      [180, 90, 60, 30, 14, 7, 1],
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// never-delete invariant
// ══════════════════════════════════════════════════════════════════════

describe('never-delete invariant', () => {
  test('no destructive method is exposed on the prototype', () => {
    const banned = /delete|remove|drop|destroy|clear/i;
    const proto = Object.getPrototypeOf(new ExpiryAlertSystem());
    const names = Object.getOwnPropertyNames(proto);
    for (const name of names) {
      if (name === 'constructor') continue;
      assert.ok(!banned.test(name), `destructive method exposed: ${name}`);
    }
  });
});
