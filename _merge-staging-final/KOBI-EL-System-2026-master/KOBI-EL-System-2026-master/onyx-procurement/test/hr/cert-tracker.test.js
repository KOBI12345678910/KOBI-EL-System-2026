/**
 * Professional Certification Tracker — Unit Tests
 * Agent Y-069 / Swarm HR / Techno-Kol Uzi Mega-ERP 2026
 *
 * Covers:
 *   - addCertification (append-only, supersede chain, catalog-driven expiry)
 *   - listExpiring       (expiry-window filter + bucket classification)
 *   - renewalReminder    (graduated 90/60/30/7-day lead tiers)
 *   - complianceGap      (role matrix missing-cert detection + severity)
 *   - roleRequirements   (single-role and full-matrix lookups)
 *   - certRepo           (portfolio snapshot with live status recompute)
 *   - verifyAuthenticity (issuer-registry stub, history append)
 *   - costTracking       (exam + course spend aggregation)
 *   - exportForAudit     (ISO / customer-audit bundle)
 *   - "never delete" invariant — superseded rows remain queryable.
 *
 * Run with: node --test test/hr/cert-tracker.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  CertTracker,
  CERT_CATALOG,
  ROLE_MATRIX,
  STATUS,
} = require('../../src/hr/cert-tracker.js');

// ─── fixed clock helpers ─────────────────────────────────────────────
const FIXED_NOW = new Date('2026-04-11T09:00:00Z');
const clockAt = (iso) => () => new Date(iso);

function makeTracker(nowIso = '2026-04-11T09:00:00Z') {
  return new CertTracker({ now: clockAt(nowIso) });
}

// ══════════════════════════════════════════════════════════════════════
// addCertification
// ══════════════════════════════════════════════════════════════════════

describe('addCertification', () => {
  test('derives expiry from CERT_CATALOG validityMonths', () => {
    const t = makeTracker();
    const cert = t.addCertification({
      employeeId: 'emp-001',
      typeCode: 'RISHUY_MEHANDES',
      name: 'רישיון מהנדס רשום',
      certNumber: 'ENG-12345',
      issueDate: '2026-01-01',
    });
    // 60-month validity → 2031-01-01
    assert.equal(cert.expiryDate, '2031-01-01');
    assert.equal(cert.status, STATUS.ACTIVE);
    assert.equal(cert.ceusRequired, 120);
    assert.equal(cert.labels.he, 'רישיון מהנדס רשום');
    assert.equal(cert.labels.en, 'Registered Engineer Licence');
  });

  test('honors explicit expiryDate even when catalog has validityMonths', () => {
    const t = makeTracker();
    const cert = t.addCertification({
      employeeId: 'emp-002',
      typeCode: 'RISHUY_HASHMALAI',
      name: 'חשמלאי',
      issueDate: '2026-02-01',
      expiryDate: '2028-02-01',
    });
    assert.equal(cert.expiryDate, '2028-02-01');
  });

  test('supersede chain never deletes the prior cert', () => {
    const t = makeTracker();
    const old = t.addCertification({
      employeeId: 'emp-003',
      typeCode: 'HETER_GOVAH',
      name: 'היתר גובה',
      issueDate: '2024-03-01',
    });
    const fresh = t.addCertification({
      employeeId: 'emp-003',
      typeCode: 'HETER_GOVAH',
      name: 'היתר גובה',
      issueDate: '2026-03-01',
      supersedes: old.id,
    });
    const repo = t.certRepo('emp-003');
    assert.equal(repo.total, 2, 'old row must remain');
    const prev = repo.certs.find(c => c.id === old.id);
    assert.equal(prev.status, STATUS.SUPERSEDED);
    assert.equal(prev.supersededBy, fresh.id);
    assert.equal(prev.history.length, 1);
    assert.equal(prev.history[0].action, 'superseded');
  });

  test('throws on missing required fields', () => {
    const t = makeTracker();
    assert.throws(() => t.addCertification({}), /input required|employeeId/i);
    assert.throws(
      () => t.addCertification({ employeeId: 'x' }),
      /name required/,
    );
    assert.throws(
      () => t.addCertification({ employeeId: 'x', name: 'y' }),
      /issueDate required/,
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// listExpiring
// ══════════════════════════════════════════════════════════════════════

describe('listExpiring', () => {
  test('buckets certs by remaining days', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    // Already expired → d=-10
    t.addCertification({
      employeeId: 'e1',
      typeCode: 'RISHUY_MANOF',
      name: 'manof',
      issueDate: '2024-04-01',
      expiryDate: '2026-04-01',
    });
    // Critical (<=7)
    t.addCertification({
      employeeId: 'e2',
      typeCode: 'TEUDAT_ZEHUT_BETICHUTIT',
      name: 'safety',
      issueDate: '2025-04-12',
      expiryDate: '2026-04-12',
    });
    // Urgent (<=30)
    t.addCertification({
      employeeId: 'e3',
      typeCode: 'RISHUY_RITUCH',
      name: 'ritutch',
      issueDate: '2023-05-01',
      expiryDate: '2026-05-01',
    });
    // Soon (<=90)
    t.addCertification({
      employeeId: 'e4',
      typeCode: 'RISHUY_HASHMALAI',
      name: 'hashmal',
      issueDate: '2021-07-01',
      expiryDate: '2026-07-01',
    });
    // Out of window
    t.addCertification({
      employeeId: 'e5',
      typeCode: 'RISHUY_MEHANDES',
      name: 'mehandes',
      issueDate: '2026-01-01',
    });

    const res = t.listExpiring({ days: 90 });
    assert.equal(res.length, 4);
    const byBucket = Object.fromEntries(res.map(r => [r.bucket, r]));
    assert.ok(byBucket.expired);
    assert.ok(byBucket.critical);
    assert.ok(byBucket.urgent);
    assert.ok(byBucket.soon);
    // Sorted ascending by daysRemaining
    for (let i = 1; i < res.length; i++) {
      assert.ok(res[i].daysRemaining >= res[i - 1].daysRemaining);
    }
  });

  test('excludes superseded rows from expiry list', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    const oldCert = t.addCertification({
      employeeId: 'e9',
      typeCode: 'HETER_GOVAH',
      name: 'gvaim',
      issueDate: '2024-04-12',
      expiryDate: '2026-04-12', // within critical window
    });
    t.addCertification({
      employeeId: 'e9',
      typeCode: 'HETER_GOVAH',
      name: 'gvaim',
      issueDate: '2026-03-01',
      expiryDate: '2028-03-01',
      supersedes: oldCert.id,
    });
    const res = t.listExpiring({ days: 90 });
    const ids = res.map(r => r.certId);
    assert.ok(!ids.includes(oldCert.id), 'superseded cert must be skipped');
  });
});

// ══════════════════════════════════════════════════════════════════════
// renewalReminder — graduated scheduling
// ══════════════════════════════════════════════════════════════════════

describe('renewalReminder', () => {
  test('assigns tiers per default [90,60,30,7] schedule', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    // expires in 5 days → critical
    t.addCertification({
      employeeId: 'c1',
      typeCode: 'TEUDAT_ZEHUT_BETICHUTIT',
      name: 'x',
      issueDate: '2025-04-16',
      expiryDate: '2026-04-16',
    });
    // expires in 20 days → high
    t.addCertification({
      employeeId: 'c2',
      typeCode: 'HETER_GOVAH',
      name: 'x',
      issueDate: '2024-05-01',
      expiryDate: '2026-05-01',
    });
    // expires in 55 days → medium
    t.addCertification({
      employeeId: 'c3',
      typeCode: 'RISHUY_RITUCH',
      name: 'x',
      issueDate: '2023-06-05',
      expiryDate: '2026-06-05',
    });
    // expires in 85 days → low
    t.addCertification({
      employeeId: 'c4',
      typeCode: 'RISHUY_HASHMALAI',
      name: 'x',
      issueDate: '2021-07-05',
      expiryDate: '2026-07-05',
    });
    // outside window (>90) → skipped
    t.addCertification({
      employeeId: 'c5',
      typeCode: 'RISHUY_MEHANDES',
      name: 'x',
      issueDate: '2024-01-01',
      expiryDate: '2027-01-01',
    });

    const res = t.renewalReminder();
    assert.equal(res.total, 4);
    assert.equal(res.byPriority.critical, 1);
    assert.equal(res.byPriority.high, 1);
    assert.equal(res.byPriority.medium, 1);
    assert.equal(res.byPriority.low, 1);
    assert.deepEqual(res.leadDays, [90, 60, 30, 7]);
    // every reminder must carry bilingual message
    for (const r of res.reminders) {
      assert.ok(r.message.he.length > 0);
      assert.ok(r.message.en.length > 0);
    }
  });

  test('custom leadDays override default', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    t.addCertification({
      employeeId: 'x1',
      typeCode: 'RISHUY_NEHIGA_KAVED',
      name: 'x',
      issueDate: '2024-04-21',
      expiryDate: '2026-04-21',
    });
    const res = t.renewalReminder({ leadDays: [14, 3] });
    assert.equal(res.total, 1);
    assert.equal(res.reminders[0].leadTier, 14);
  });
});

// ══════════════════════════════════════════════════════════════════════
// complianceGap
// ══════════════════════════════════════════════════════════════════════

describe('complianceGap', () => {
  test('detects missing required certs against role matrix', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    // electrician emp has no certs → blocking gap
    // site-engineer emp has RISHUY_MEHANDES + HETER_GOVAH + TZB → compliant
    t.addCertification({
      employeeId: 'eng-01',
      typeCode: 'RISHUY_MEHANDES',
      name: 'mehandes',
      issueDate: '2024-01-01',
    });
    t.addCertification({
      employeeId: 'eng-01',
      typeCode: 'HETER_GOVAH',
      name: 'gvaim',
      issueDate: '2025-03-01',
    });
    t.addCertification({
      employeeId: 'eng-01',
      typeCode: 'TEUDAT_ZEHUT_BETICHUTIT',
      name: 'safety',
      issueDate: '2025-06-01',
    });

    const res = t.complianceGap({
      required: {
        'eng-01': 'site-engineer',
        'elec-02': 'electrician',
      },
    });
    assert.equal(res.totalEmployees, 2);
    assert.equal(res.compliantCount, 1);
    assert.equal(res.gapCount, 1);
    assert.equal(res.blocking, 1);
    const gap = res.gaps[0];
    assert.equal(gap.employeeId, 'elec-02');
    assert.equal(gap.severity, 'blocking');
    const codes = gap.missing.map(m => m.code);
    assert.ok(codes.includes('RISHUY_HASHMALAI'));
    assert.ok(codes.includes('TEUDAT_ZEHUT_BETICHUTIT'));
  });

  test('treats expired certs as missing', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    t.addCertification({
      employeeId: 'op-07',
      typeCode: 'RISHUY_MANOF',
      name: 'crane',
      issueDate: '2023-01-01',
      expiryDate: '2025-01-01', // expired
    });
    t.addCertification({
      employeeId: 'op-07',
      typeCode: 'TEUDAT_ZEHUT_BETICHUTIT',
      name: 'safety',
      issueDate: '2025-06-01',
    });
    const res = t.complianceGap({
      required: { 'op-07': 'crane-operator' },
    });
    assert.equal(res.gapCount, 1);
    const codes = res.gaps[0].missing.map(m => m.code);
    assert.ok(codes.includes('RISHUY_MANOF'), 'expired crane cert counts as missing');
  });

  test('supports ad-hoc typeCode list instead of role', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    t.addCertification({
      employeeId: 'z',
      typeCode: 'AVTACHAT_MEYDA',
      name: 'sec',
      issueDate: '2025-01-01',
    });
    const res = t.complianceGap({
      required: {
        z: ['AVTACHAT_MEYDA', 'TEUDAT_ZEHUT_BETICHUTIT'],
      },
    });
    assert.equal(res.gapCount, 1);
    assert.equal(res.gaps[0].missing[0].code, 'TEUDAT_ZEHUT_BETICHUTIT');
  });
});

// ══════════════════════════════════════════════════════════════════════
// roleRequirements
// ══════════════════════════════════════════════════════════════════════

describe('roleRequirements', () => {
  test('returns required + recommended for a role', () => {
    const t = makeTracker();
    const r = t.roleRequirements('electrician');
    assert.equal(r.role, 'electrician');
    assert.equal(r.labels.he, 'חשמלאי');
    const reqCodes = r.required.map(x => x.code);
    assert.ok(reqCodes.includes('RISHUY_HASHMALAI'));
    assert.ok(reqCodes.includes('TEUDAT_ZEHUT_BETICHUTIT'));
    // each entry exposes validity + law
    for (const item of r.required) {
      assert.ok(item.he && item.en);
      assert.ok(item.validityMonths);
    }
  });

  test('returns full matrix when role omitted', () => {
    const t = makeTracker();
    const all = t.roleRequirements();
    const roleKeys = Object.keys(all);
    assert.ok(roleKeys.length >= 8);
    assert.ok(all['crane-operator']);
    assert.ok(all['truck-driver']);
  });
});

// ══════════════════════════════════════════════════════════════════════
// certRepo + verifyAuthenticity + costTracking + exportForAudit
// ══════════════════════════════════════════════════════════════════════

describe('certRepo & verifyAuthenticity', () => {
  test('certRepo returns bucketed portfolio', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    // active
    t.addCertification({
      employeeId: 'e', typeCode: 'RISHUY_MEHANDES', name: 'x',
      issueDate: '2024-01-01',
    });
    // expiring (within 90d)
    t.addCertification({
      employeeId: 'e', typeCode: 'TEUDAT_ZEHUT_BETICHUTIT', name: 'y',
      issueDate: '2025-05-15', expiryDate: '2026-05-15',
    });
    // expired
    t.addCertification({
      employeeId: 'e', typeCode: 'HETER_GOVAH', name: 'z',
      issueDate: '2023-01-01', expiryDate: '2025-01-01',
    });
    const repo = t.certRepo('e');
    assert.equal(repo.total, 3);
    assert.equal(repo.active, 1);
    assert.equal(repo.expiring, 1);
    assert.equal(repo.expired, 1);
  });

  test('verifyAuthenticity marks verified when in registry', () => {
    const registry = new Map();
    registry.set('Registrar of Engineers & Architects — Ministry of Labor',
      new Set(['ENG-9999']));
    const t = new CertTracker({
      now: clockAt('2026-04-11T00:00:00Z'),
      authorityRegistry: registry,
    });
    const cert = t.addCertification({
      employeeId: 'v1',
      typeCode: 'RISHUY_MEHANDES',
      name: 'mehandes',
      certNumber: 'ENG-9999',
      issueDate: '2024-01-01',
    });
    const r = t.verifyAuthenticity({ cert });
    assert.equal(r.verified, true);
    assert.ok(r.confidence > 0.9);

    const live = t.certRepo('v1').certs[0];
    assert.equal(live.verificationStatus, 'verified');
    assert.equal(live.history[0].action, 'verify-attempt');
  });

  test('verifyAuthenticity flags missing registry as unverified', () => {
    const t = makeTracker();
    const cert = t.addCertification({
      employeeId: 'u1',
      typeCode: 'RISHUY_HASHMALAI',
      name: 'elec',
      certNumber: 'HSH-1',
      issueDate: '2024-01-01',
    });
    const r = t.verifyAuthenticity({ cert });
    assert.equal(r.verified, false);
    assert.equal(r.source, 'offline-stub');
  });
});

describe('costTracking', () => {
  test('aggregates exam + course per employee within period', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    t.addCertification({
      employeeId: 'p1',
      typeCode: 'RISHUY_MEHANDES',
      name: 'x',
      issueDate: '2026-01-05',
      cost: { exam: 800, course: 2500, currency: 'ILS' },
    });
    t.addCertification({
      employeeId: 'p1',
      typeCode: 'AVTACHAT_MEYDA',
      name: 'sec',
      issueDate: '2026-02-15',
      cost: { exam: 2100, course: 4400 },
    });
    t.addCertification({
      employeeId: 'p2',
      typeCode: 'HETER_GOVAH',
      name: 'gvaim',
      issueDate: '2026-03-01',
      cost: { exam: 300, course: 1200 },
    });
    const report = t.costTracking({ start: '2026-01-01', end: '2026-04-01' });
    assert.equal(report.certCount, 3);
    assert.equal(report.employeeCount, 2);
    assert.equal(report.totalExam, 3200);
    assert.equal(report.totalCourse, 8100);
    assert.equal(report.grandTotal, 11300);
    // p1 should lead total
    assert.equal(report.employees[0].employeeId, 'p1');
    assert.equal(report.employees[0].total, 9800);
    assert.equal(report.employees[0].currency, 'ILS');
  });
});

describe('exportForAudit', () => {
  test('emits ISO-compatible bundle with role matrix + summary', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    t.addCertification({
      employeeId: 'aud1',
      typeCode: 'RISHUY_MEHANDES',
      name: 'mehandes',
      certNumber: 'ENG-1',
      issueDate: '2025-01-01',
    });
    const bundle = t.exportForAudit({ start: '2025-01-01', end: '2026-12-31' });
    assert.equal(bundle.schema, 'techno-kol.cert-audit.v1');
    assert.equal(bundle.summary.total, 1);
    assert.equal(bundle.summary.uniqueEmployees, 1);
    assert.ok(bundle.standards.length >= 3);
    assert.ok(bundle.roleMatrix['site-engineer']);
    assert.equal(bundle.bilingualTitle.he, 'דו"ח ביקורת תעודות מקצועיות');
  });
});

// ══════════════════════════════════════════════════════════════════════
// INVARIANT: never delete, only supersede
// ══════════════════════════════════════════════════════════════════════

describe('invariant: append-only history', () => {
  test('CertTracker has no delete / remove API', () => {
    const t = makeTracker();
    const proto = Object.getPrototypeOf(t);
    const methods = Object.getOwnPropertyNames(proto);
    for (const m of methods) {
      assert.ok(
        !/delete|remove|drop|destroy/i.test(m),
        `destructive method "${m}" must not exist`,
      );
    }
  });

  test('CERT_CATALOG covers all 9 required Israeli types', () => {
    const required = [
      'RISHUY_MEHANDES',
      'RISHUY_HANDASAI',
      'RISHUY_HASHMALAI',
      'RISHUY_MANOF',
      'RISHUY_RITUCH',
      'HETER_GOVAH',
      'RISHUY_NEHIGA_KAVED',
      'AVTACHAT_MEYDA',
      'TEUDAT_ZEHUT_BETICHUTIT',
    ];
    for (const code of required) {
      assert.ok(CERT_CATALOG[code], `missing catalog entry ${code}`);
      assert.ok(CERT_CATALOG[code].he);
      assert.ok(CERT_CATALOG[code].en);
    }
  });

  test('ROLE_MATRIX only references catalog codes', () => {
    for (const [role, def] of Object.entries(ROLE_MATRIX)) {
      for (const code of [...def.required, ...def.recommended]) {
        assert.ok(
          CERT_CATALOG[code],
          `role ${role} references unknown cert ${code}`,
        );
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// Silence-the-linter: pin imported FIXED_NOW
// ══════════════════════════════════════════════════════════════════════

test('module fixed-clock constant is stable', () => {
  assert.equal(FIXED_NOW.toISOString(), '2026-04-11T09:00:00.000Z');
});
