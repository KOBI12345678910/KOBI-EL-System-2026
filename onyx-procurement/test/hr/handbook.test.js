/**
 * Employee Handbook — Unit Tests
 * Agent Y-074 / Swarm HR / Techno-Kol Uzi Mega-ERP 2026
 *
 * Covers:
 *   - createVersion (seed fallback, duplicate-id guard, validation)
 *   - publishVersion (supersession, never-delete invariant)
 *   - acknowledgeReceipt (all three methods, append-only log)
 *   - missingAcks (population-based gap report)
 *   - diffVersions (added / removed / changed / unchanged buckets)
 *   - legalComplianceCheck (Israeli required sections)
 *   - searchHandbook (Hebrew + English + nikud-tolerant matching)
 *   - linkToPolicy (cumulative idempotent linkage)
 *   - sendAckReminder (bilingual output)
 *   - generatePDF (valid %PDF header, page count, non-empty bytes)
 *   - "never delete" invariant — superseded versions remain queryable.
 *
 * Run with:  node --test test/hr/handbook.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  EmployeeHandbook,
  ACK_METHODS,
  VERSION_STATUS,
  REQUIRED_ISRAELI_SECTIONS,
  SEED_SECTIONS,
} = require('../../src/hr/handbook.js');

// ─── fixed clock helpers ─────────────────────────────────────────────
const FIXED_NOW = '2026-04-11T09:00:00Z';
const clockAt = (iso) => () => new Date(iso);

function makeHandbook(nowIso = FIXED_NOW) {
  return new EmployeeHandbook({ now: clockAt(nowIso) });
}

function baseVersionSpec(overrides = {}) {
  return {
    id: 'hb-2026-04',
    version: '1.0.0',
    effectiveDate: '2026-04-01',
    sections: EmployeeHandbook.seedSections(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// createVersion
// ══════════════════════════════════════════════════════════════════════

describe('createVersion', () => {
  test('creates a draft version using the seed sections when none provided', () => {
    const hb = makeHandbook();
    const v = hb.createVersion({
      id: 'hb-2026-04',
      version: '1.0.0',
      effectiveDate: '2026-04-01',
    });
    assert.equal(v.status, VERSION_STATUS.DRAFT);
    assert.equal(v.version, '1.0.0');
    assert.equal(v.sections.length, SEED_SECTIONS.length);
    assert.ok(v.sections.some((s) => s.id === 'harassment'), 'must include harassment section');
    assert.ok(v.sections.some((s) => s.id === 'safety'), 'must include safety section');
  });

  test('rejects missing id / version / bilingual content', () => {
    const hb = makeHandbook();
    assert.throws(() => hb.createVersion(), /spec/);
    assert.throws(() => hb.createVersion({ version: '1.0.0' }), /id/);
    assert.throws(() => hb.createVersion({ id: 'x' }), /version/);
    assert.throws(
      () =>
        hb.createVersion({
          id: 'x',
          version: '1',
          sections: [{ id: 'a', title_he: 'כותרת', content_he: 'תוכן' }],
        }),
      /title_en/,
    );
  });

  test('rejects duplicate section ids within a single version', () => {
    const hb = makeHandbook();
    assert.throws(
      () =>
        hb.createVersion({
          id: 'hb-dup',
          version: '1',
          sections: [
            {
              id: 'welcome',
              title_he: 'א',
              title_en: 'A',
              content_he: 'א',
              content_en: 'A',
            },
            {
              id: 'welcome',
              title_he: 'ב',
              title_en: 'B',
              content_he: 'ב',
              content_en: 'B',
            },
          ],
        }),
      /Duplicate section id/,
    );
  });

  test('refuses to replace a non-draft version (never-delete invariant)', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    assert.throws(
      () => hb.createVersion(baseVersionSpec()),
      /Cannot replace non-draft/,
    );
    // but the original is still there
    const stored = hb.getVersion('hb-2026-04');
    assert.equal(stored.status, VERSION_STATUS.PUBLISHED);
  });
});

// ══════════════════════════════════════════════════════════════════════
// publishVersion
// ══════════════════════════════════════════════════════════════════════

describe('publishVersion', () => {
  test('marks the new version published and supersedes the previous one', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec({ id: 'v1', version: '1.0.0' }));
    hb.publishVersion('v1');
    const active1 = hb.getActiveVersion();
    assert.equal(active1.id, 'v1');
    assert.equal(active1.status, VERSION_STATUS.PUBLISHED);

    hb.createVersion(baseVersionSpec({ id: 'v2', version: '2.0.0' }));
    hb.publishVersion('v2');

    const active2 = hb.getActiveVersion();
    assert.equal(active2.id, 'v2');

    // v1 is superseded — still queryable, not deleted
    const v1 = hb.getVersion('v1');
    assert.equal(v1.status, VERSION_STATUS.SUPERSEDED);
    assert.equal(v1.supersededBy, 'v2');
    assert.ok(v1.supersededAt, 'supersededAt should be stamped');
  });

  test('publishVersion is idempotent for an already-published version', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    const r1 = hb.publishVersion('hb-2026-04');
    const r2 = hb.publishVersion('hb-2026-04');
    assert.equal(r1.id, r2.id);
    assert.equal(r2.status, VERSION_STATUS.PUBLISHED);
  });

  test('refuses to re-publish a superseded version', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec({ id: 'v1' }));
    hb.publishVersion('v1');
    hb.createVersion(baseVersionSpec({ id: 'v2', version: '2.0' }));
    hb.publishVersion('v2');
    assert.throws(() => hb.publishVersion('v1'), /Cannot publish/);
  });

  test('listVersions returns the full append-only history', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec({ id: 'v1' }));
    hb.publishVersion('v1');
    hb.createVersion(baseVersionSpec({ id: 'v2', version: '2.0' }));
    hb.publishVersion('v2');
    hb.createVersion(baseVersionSpec({ id: 'v3', version: '3.0' }));
    // v3 still draft — but listVersions should return all three
    const list = hb.listVersions();
    assert.equal(list.length, 3);
    const ids = list.map((v) => v.id).sort();
    assert.deepEqual(ids, ['v1', 'v2', 'v3']);
  });
});

// ══════════════════════════════════════════════════════════════════════
// acknowledgeReceipt / missingAcks
// ══════════════════════════════════════════════════════════════════════

describe('acknowledgeReceipt', () => {
  test('records acknowledgment with signature / click / biometric', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');

    const a1 = hb.acknowledgeReceipt({
      employeeId: 'emp-001',
      versionId: 'hb-2026-04',
      method: 'signature',
    });
    const a2 = hb.acknowledgeReceipt({
      employeeId: 'emp-002',
      versionId: 'hb-2026-04',
      method: 'click',
    });
    const a3 = hb.acknowledgeReceipt({
      employeeId: 'emp-003',
      versionId: 'hb-2026-04',
      method: 'biometric',
    });
    assert.equal(a1.method, 'signature');
    assert.equal(a2.method, 'click');
    assert.equal(a3.method, 'biometric');
    assert.equal(hb.listAcknowledgments('hb-2026-04').length, 3);
  });

  test('rejects an unknown ack method', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    assert.throws(
      () =>
        hb.acknowledgeReceipt({
          employeeId: 'emp-001',
          versionId: 'hb-2026-04',
          method: 'fingers-crossed',
        }),
      /Invalid ack method/,
    );
  });

  test('rejects ack for unknown version', () => {
    const hb = makeHandbook();
    assert.throws(
      () =>
        hb.acknowledgeReceipt({
          employeeId: 'emp-001',
          versionId: 'ghost',
          method: 'click',
        }),
      /Unknown version/,
    );
  });

  test('missingAcks lists only employees that have not signed', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    hb.acknowledgeReceipt({ employeeId: 'emp-001', versionId: 'hb-2026-04', method: 'click' });
    hb.acknowledgeReceipt({ employeeId: 'emp-002', versionId: 'hb-2026-04', method: 'signature' });

    const missing = hb.missingAcks('hb-2026-04', ['emp-001', 'emp-002', 'emp-003', 'emp-004']);
    assert.deepEqual(missing, ['emp-003', 'emp-004']);
  });

  test('missingAcks without explicit population falls back to everyone seen in the ack log', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec({ id: 'v1' }));
    hb.publishVersion('v1');
    hb.acknowledgeReceipt({ employeeId: 'emp-001', versionId: 'v1', method: 'click' });

    hb.createVersion(baseVersionSpec({ id: 'v2', version: '2.0' }));
    hb.publishVersion('v2');
    hb.acknowledgeReceipt({ employeeId: 'emp-002', versionId: 'v2', method: 'click' });

    // Against v2 the derived population is {emp-001, emp-002} — emp-001 missing.
    const missing = hb.missingAcks('v2');
    assert.deepEqual(missing, ['emp-001']);
  });
});

// ══════════════════════════════════════════════════════════════════════
// diffVersions
// ══════════════════════════════════════════════════════════════════════

describe('diffVersions', () => {
  test('detects added, removed, and changed sections', () => {
    const hb = makeHandbook();
    const seed = EmployeeHandbook.seedSections();
    hb.createVersion({ id: 'v1', version: '1.0.0', sections: seed });
    hb.publishVersion('v1');

    // v2 = seed minus 'dress_code' plus a new 'remote_work' section,
    // and 'wages' content rewritten
    const modified = seed
      .filter((s) => s.id !== 'dress_code')
      .map((s) =>
        s.id === 'wages'
          ? { ...s, content_he: s.content_he + ' (עדכון 2026)' }
          : s,
      );
    modified.push({
      id: 'remote_work',
      title_he: 'עבודה מרחוק',
      title_en: 'Remote work',
      content_he: 'מדיניות עבודה מהבית עד יומיים בשבוע.',
      content_en: 'Work-from-home policy up to two days per week.',
      legal_references: [],
    });
    hb.createVersion({ id: 'v2', version: '2.0.0', sections: modified });

    const diff = hb.diffVersions('v1', 'v2');
    assert.equal(diff.summary.addedCount, 1);
    assert.equal(diff.added[0].id, 'remote_work');
    assert.equal(diff.summary.removedCount, 1);
    assert.equal(diff.removed[0].id, 'dress_code');
    assert.equal(diff.summary.changedCount, 1);
    assert.equal(diff.changed[0].id, 'wages');
    assert.ok(diff.changed[0].fields.includes('content_he'));
    assert.ok(diff.summary.unchangedCount > 0);
  });

  test('throws on unknown version id', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    assert.throws(() => hb.diffVersions('hb-2026-04', 'nope'), /Unknown version/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// legalComplianceCheck
// ══════════════════════════════════════════════════════════════════════

describe('legalComplianceCheck', () => {
  test('seeded version is compliant — all required Israeli sections present', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    const result = hb.legalComplianceCheck('hb-2026-04');
    assert.equal(result.compliant, true);
    assert.equal(result.missing.length, 0);
    assert.equal(result.present.length, REQUIRED_ISRAELI_SECTIONS.length);
    const keys = result.present.map((p) => p.key).sort();
    assert.ok(keys.includes('harassment'));
    assert.ok(keys.includes('safety'));
    assert.ok(keys.includes('equal_opportunity'));
  });

  test('minimal version flags missing mandatory sections', () => {
    const hb = makeHandbook();
    hb.createVersion({
      id: 'minimal',
      version: '0.1',
      sections: [
        {
          id: 'welcome',
          title_he: 'ברוכים הבאים',
          title_en: 'Welcome',
          content_he: 'ברוכים הבאים.',
          content_en: 'Welcome.',
        },
      ],
    });
    const r = hb.legalComplianceCheck('minimal');
    assert.equal(r.compliant, false);
    const missingKeys = r.missing.map((m) => m.key);
    assert.ok(missingKeys.includes('harassment'));
    assert.ok(missingKeys.includes('safety'));
    assert.ok(missingKeys.includes('equal_opportunity'));
  });
});

// ══════════════════════════════════════════════════════════════════════
// searchHandbook
// ══════════════════════════════════════════════════════════════════════

describe('searchHandbook', () => {
  test('finds sections by Hebrew keyword', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    const hits = hb.searchHandbook('הטרדה', 'he');
    assert.ok(hits.length > 0);
    assert.ok(hits.some((h) => h.sectionId === 'harassment'));
    assert.equal(hits[0].language, 'he');
  });

  test('finds sections by English keyword', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    const hits = hb.searchHandbook('safety', 'en');
    assert.ok(hits.length > 0);
    assert.ok(hits.some((h) => h.sectionId === 'safety'));
  });

  test('tolerates nikud in Hebrew query (שָׁלוֹם ≈ שלום)', () => {
    const hb = makeHandbook();
    hb.createVersion({
      id: 'niqqud-test',
      version: '1',
      sections: [
        {
          id: 'greeting',
          title_he: 'שָׁלוֹם',
          title_en: 'Greeting',
          content_he: 'שָׁלוֹם וברכה',
          content_en: 'Hello and welcome',
        },
      ],
    });
    hb.publishVersion('niqqud-test');
    const hits = hb.searchHandbook('שלום', 'he');
    assert.ok(hits.length > 0, 'should match even with nikud stripped');
  });

  test('empty query or no active version returns empty array', () => {
    const hb = makeHandbook();
    assert.deepEqual(hb.searchHandbook('whatever', 'en'), []);
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    assert.deepEqual(hb.searchHandbook('', 'en'), []);
  });
});

// ══════════════════════════════════════════════════════════════════════
// linkToPolicy
// ══════════════════════════════════════════════════════════════════════

describe('linkToPolicy', () => {
  test('accumulates policyIds without duplicates', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    const r1 = hb.linkToPolicy({ section: 'harassment', policyId: 'POL-001' });
    const r2 = hb.linkToPolicy({ section: 'harassment', policyId: 'POL-002' });
    const r3 = hb.linkToPolicy({ section: 'harassment', policyId: 'POL-001' }); // dup
    assert.deepEqual(r1, ['POL-001']);
    assert.deepEqual(r2, ['POL-001', 'POL-002']);
    assert.deepEqual(r3, ['POL-001', 'POL-002']);
    assert.deepEqual(hb.getPolicyLinks('harassment'), ['POL-001', 'POL-002']);
  });

  test('rejects missing params', () => {
    const hb = makeHandbook();
    assert.throws(() => hb.linkToPolicy({ section: 'x' }), /policyId/);
    assert.throws(() => hb.linkToPolicy({ policyId: 'y' }), /section/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// sendAckReminder
// ══════════════════════════════════════════════════════════════════════

describe('sendAckReminder', () => {
  test('produces bilingual reminder objects and logs them', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    const reminders = hb.sendAckReminder(['emp-001', 'emp-002']);
    assert.equal(reminders.length, 2);
    for (const r of reminders) {
      assert.ok(r.subject_he.includes('תזכורת'));
      assert.ok(r.subject_en.includes('Reminder'));
      assert.ok(r.body_he.length > 0);
      assert.ok(r.body_en.length > 0);
      assert.equal(r.versionId, 'hb-2026-04');
    }
    assert.equal(hb.listReminders().length, 2);
  });

  test('returns empty array for empty employee list', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    assert.deepEqual(hb.sendAckReminder([]), []);
  });
});

// ══════════════════════════════════════════════════════════════════════
// generatePDF
// ══════════════════════════════════════════════════════════════════════

describe('generatePDF', () => {
  test('produces a valid PDF with header, %%EOF, and non-zero page count', () => {
    const hb = makeHandbook();
    hb.createVersion(baseVersionSpec());
    hb.publishVersion('hb-2026-04');
    const pdf = hb.generatePDF('hb-2026-04');
    assert.ok(pdf.bytes instanceof Buffer);
    assert.ok(pdf.bytes.length > 200);
    const head = pdf.bytes.slice(0, 5).toString('latin1');
    assert.equal(head, '%PDF-');
    const tail = pdf.bytes.slice(-6).toString('latin1');
    assert.ok(tail.includes('%%EOF'));
    assert.ok(pdf.pageCount >= 1);
    assert.equal(pdf.mimeType, 'application/pdf');
    assert.equal(pdf.direction, 'rtl');
    assert.ok(pdf.filename.endsWith('.pdf'));
  });

  test('throws for unknown version', () => {
    const hb = makeHandbook();
    assert.throws(() => hb.generatePDF('ghost'), /No version|Unknown version/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Static helpers
// ══════════════════════════════════════════════════════════════════════

describe('static helpers', () => {
  test('seedSections returns the full 16-section bilingual set', () => {
    const seeds = EmployeeHandbook.seedSections();
    assert.ok(seeds.length >= 16);
    for (const s of seeds) {
      assert.ok(s.id);
      assert.ok(s.title_he);
      assert.ok(s.title_en);
      assert.ok(s.content_he);
      assert.ok(s.content_en);
    }
  });

  test('ackMethods returns the three supported methods', () => {
    assert.deepEqual(
      EmployeeHandbook.ackMethods().sort(),
      ['biometric', 'click', 'signature'],
    );
    assert.deepEqual(ACK_METHODS.slice().sort(), ['biometric', 'click', 'signature']);
  });

  test('requiredIsraeliSections exposes all mandatory keys with law references', () => {
    const req = EmployeeHandbook.requiredIsraeliSections();
    const keys = req.map((r) => r.key).sort();
    assert.ok(keys.includes('harassment'));
    assert.ok(keys.includes('safety'));
    assert.ok(keys.includes('equal_opportunity'));
    for (const r of req) {
      assert.ok(r.law, `${r.key} must cite a statute`);
    }
  });
});
